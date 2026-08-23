import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as cheerio from 'cheerio';
import { Repository } from 'typeorm';
import { errorMessage } from '../utils/functions';
import { AurMaintainerInfoEntity } from './aur-maintainer-info.entity';

const AUR_LOGIN_URL = 'https://aur.archlinux.org/login?next=/';
const AUR_PROFILE_URL = 'https://aur.archlinux.org/account';
const AUR_SESSION_COOKIE = 'AURSID';
const AUR_REFERER = 'https://aur.archlinux.org/login';
/** Label of the profile-table cell holding the account creation date. */
const REGISTRATION_DATE_LABEL = 'Registration date:';
const SESSION_TTL_MS = 30 * 60 * 1000;
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

@Injectable()
export class AurAuthService {
  private readonly logger = new Logger(AurAuthService.name);
  private sessionCookie: string | null = null;
  private sessionExpiresAt = 0;
  private loginPromise: Promise<boolean> | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AurMaintainerInfoEntity)
    private readonly maintainerInfoRepository: Repository<AurMaintainerInfoEntity>,
  ) {}

  /** Returns the account creation date, using the persisted value once scraped (it never changes). */
  async getMaintainerRegistrationDate(username: string): Promise<Date | null> {
    const cached = await this.maintainerInfoRepository.findOne({ where: { username } });
    if (cached) return cached.registeredDate;

    const scraped = await this.scrapeRegistrationDate(username);
    if (!scraped) return null;

    await this.maintainerInfoRepository.upsert({ username, registeredDate: scraped, fetchedAt: Date.now() }, [
      'username',
    ]);
    return scraped;
  }

  private async scrapeRegistrationDate(username: string): Promise<Date | null> {
    if (!(await this.ensureSession())) return null;

    try {
      const response = await fetch(`${AUR_PROFILE_URL}/${encodeURIComponent(username)}`, {
        headers: { 'User-Agent': USER_AGENT, 'Cookie': this.sessionCookie ?? '' },
      });
      if (!response.ok) {
        this.logger.warn(`Failed to fetch AUR profile for ${username}: ${response.status}`);
        return null;
      }

      return this.parseRegistrationDate(await response.text(), username);
    } catch (error) {
      this.logger.error(`Error fetching AUR profile for ${username}: ${errorMessage(error)}`);
      return null;
    }
  }

  private parseRegistrationDate(html: string, username: string): Date | null {
    const $ = cheerio.load(html);

    for (const row of $('table.bio tr').toArray()) {
      if ($(row).find('th').text().trim() !== REGISTRATION_DATE_LABEL) continue;

      // Format on AUR profiles: "2023-12-29 (CET)"
      const match = $(row)
        .find('td')
        .text()
        .match(/(\d{4}-\d{2}-\d{2})/);
      if (!match) break;

      const registeredDate = new Date(match[1]);
      if (!Number.isNaN(registeredDate.getTime())) return registeredDate;
      break;
    }

    this.logger.debug(`Could not extract registration date for ${username}`);
    return null;
  }

  private async ensureSession(): Promise<boolean> {
    if (this.sessionCookie && Date.now() < this.sessionExpiresAt) return true;
    // Concurrent callers share a single in-flight login instead of racing.
    this.loginPromise ??= this.login().finally(() => {
      this.loginPromise = null;
    });
    return await this.loginPromise;
  }

  private async login(): Promise<boolean> {
    const username = this.configService.get<string>('aur.username');
    const password = this.configService.get<string>('aur.password');
    if (!username || !password) {
      this.logger.warn('AUR credentials not configured, cannot scrape registration dates');
      return false;
    }

    try {
      const response = await fetch(AUR_LOGIN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          'Referer': AUR_REFERER,
        },
        body: new URLSearchParams({
          user: username,
          passwd: password,
          remember_me: 'on',
          referer: 'http://aur.archlinux.org',
          next: '/',
        }),
        redirect: 'manual',
      });

      const cookies = response.headers.getSetCookie();
      const session = cookies.find((cookie) => cookie.startsWith(AUR_SESSION_COOKIE));
      if ((response.status === 302 || response.status === 303) && session) {
        this.sessionCookie = session.split(';')[0];
        this.sessionExpiresAt = Date.now() + SESSION_TTL_MS;
        this.logger.log('Authenticated with AUR');
        return true;
      }

      this.logger.warn(`AUR login failed with status: ${response.status}`);
      return false;
    } catch (error) {
      this.logger.error(`Error during AUR login: ${errorMessage(error)}`);
      return false;
    }
  }
}

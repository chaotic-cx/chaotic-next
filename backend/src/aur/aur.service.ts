import { cachedResult } from '../utils/cache';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { type Cache } from 'cache-manager';

const AUR_SUGGEST_URL = 'https://aur.archlinux.org/rpc/v5/suggest';
const AUR_TIMEOUT_MS = 5000;
const MAX_SUGGESTIONS = 20;
const SUGGESTIONS_CACHE_TTL_MS = 60_000;

@Injectable()
export class AurService {
  constructor(
    @InjectPinoLogger(AurService.name) private readonly pino: PinoLogger,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getSuggestions(query: string): Promise<string[]> {
    return cachedResult(this.cache, `aur:suggest:${query}`, SUGGESTIONS_CACHE_TTL_MS, () =>
      this.fetchSuggestions(query),
    );
  }

  private async fetchSuggestions(query: string): Promise<string[]> {
    try {
      const response = await fetch(`${AUR_SUGGEST_URL}/${encodeURIComponent(query)}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(AUR_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.pino.warn({ statusCode: response.status }, 'AUR suggest returned a non-ok status');
        return [];
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data)) return [];
      return data.filter((item): item is string => typeof item === 'string').slice(0, MAX_SUGGESTIONS);
    } catch (err) {
      this.pino.warn({ err }, 'AUR suggest failed');
      return [];
    }
  }
}

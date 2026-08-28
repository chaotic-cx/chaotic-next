import { Repo } from '../builder/builder.entity';
import { decryptAes } from '../utils/functions';
import { Gitlab } from '@gitbeaker/rest';
import { Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';

export async function gitlabRawFileToString(raw: string | Blob): Promise<string> {
  if (typeof raw === 'string') return raw;
  return await raw.text();
}

@Injectable()
export class GitlabApiService implements OnModuleInit {
  api!: Gitlab;
  chaoticId!: string;

  constructor(
    @InjectPinoLogger(GitlabApiService.name) private readonly pino: PinoLogger,
    private readonly configService: ConfigService,
    @InjectRepository(Repo)
    private readonly repoRepository: Repository<Repo>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initApiClient().catch((err) =>
      this.pino.error({ err }, 'GitLab client init failed, review features unavailable'),
    );
  }

  private async initApiClient(): Promise<void> {
    const repo = await this.repoRepository.findOne({ where: { name: 'chaotic-aur' } }).catch((err) => {
      this.pino.warn({ err }, 'Could not load chaotic-aur repo row');
      return null;
    });
    if (!repo?.gitlabProjectId) {
      throw new Error('No chaotic-aur repo row with gitlabProjectId found; cannot initialise GitLab client');
    }
    this.chaoticId = repo?.gitlabProjectId;

    let token: string | undefined;
    if (repo?.apiToken) {
      try {
        token = decryptAes(repo.apiToken, this.configService.getOrThrow<string>('app.dbKey'));
      } catch (err) {
        this.pino.warn({ err }, 'Could not decrypt chaotic-aur apiToken');
      }
    }
    if (!token) {
      throw new Error('No chaotic-aur apiToken configured');
    }

    this.api = new Gitlab({ token });
  }

  assertApiReady(): void {
    if (!this.api) {
      throw new ServiceUnavailableException(
        'GitLab client is not initialised; GitLab integration features are unavailable.',
      );
    }
  }

  async getRepoGitlabProjectId(repoName: string): Promise<string> {
    const repo = await this.repoRepository.findOne({ where: { name: repoName } });
    if (!repo?.gitlabProjectId) {
      throw new NotFoundException(`Repository '${repoName}' not found or has no GitLab project ID`);
    }
    return repo.gitlabProjectId;
  }

  async getDecryptedToken(repoName: string): Promise<string> {
    const repo = await this.repoRepository.findOne({ where: { name: repoName } });
    if (!repo?.apiToken) {
      throw new ServiceUnavailableException(`Repo ${repoName} has no apiToken`);
    }
    return decryptAes(repo.apiToken, this.configService.getOrThrow<string>('app.dbKey'));
  }
}

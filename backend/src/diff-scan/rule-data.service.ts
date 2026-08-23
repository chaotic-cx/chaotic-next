import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { errorMessage } from '../utils/functions';
import { DiffScanRuleData } from './rule-data.entity';
import { provideRuleDataStore, type RuleDataStore } from './rules/rule-data-store';

@Injectable()
export class RuleDataService implements OnModuleInit, RuleDataStore {
  private readonly logger = new Logger(RuleDataService.name);

  constructor(
    @Optional()
    @InjectRepository(DiffScanRuleData)
    private readonly repository?: Repository<DiffScanRuleData>,
  ) {}

  onModuleInit(): void {
    provideRuleDataStore(this.repository ? this : null);
    this.logger.log(
      this.repository ? 'Rule data persistence enabled' : 'Rule data persistence unavailable, feeds load per scan',
    );
  }

  async load(cacheKey: string): Promise<string | null> {
    if (!this.repository) return null;
    try {
      const row = await this.repository.findOne({ where: { cacheKey } });
      return row?.raw ?? null;
    } catch (err) {
      this.logger.warn(`Rule data read for "${cacheKey}" failed: ${errorMessage(err)}`);
      return null;
    }
  }

  async save(cacheKey: string, raw: string): Promise<void> {
    if (!this.repository) return;
    try {
      await this.repository.upsert({ cacheKey, raw, fetchedAt: new Date() }, ['cacheKey']);
    } catch (err) {
      this.logger.warn(`Rule data persist for "${cacheKey}" failed: ${errorMessage(err)}`);
    }
  }
}

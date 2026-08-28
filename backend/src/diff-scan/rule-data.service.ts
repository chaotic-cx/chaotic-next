import { DiffScanRuleData } from './rule-data.entity';
import { provideRuleDataStore, type RuleDataStore } from './rules/rule-data-store';
import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';

@Injectable()
export class RuleDataService implements OnModuleInit, RuleDataStore {
  constructor(
    @InjectPinoLogger(RuleDataService.name) private readonly pino: PinoLogger,
    @Optional()
    @InjectRepository(DiffScanRuleData)
    private readonly repository?: Repository<DiffScanRuleData>,
  ) {}

  onModuleInit(): void {
    provideRuleDataStore(this.repository ? this : null);
    this.pino.info(
      this.repository ? 'Rule data persistence enabled' : 'Rule data persistence unavailable, feeds load per scan',
    );
  }

  async load(cacheKey: string): Promise<string | null> {
    if (!this.repository) return null;
    try {
      const row = await this.repository.findOne({ where: { cacheKey } });
      return row?.raw ?? null;
    } catch (err) {
      this.pino.warn({ cacheKey, err }, 'Rule data read failed');
      return null;
    }
  }

  async save(cacheKey: string, raw: string): Promise<void> {
    if (!this.repository) return;
    try {
      await this.repository.upsert({ cacheKey, raw, fetchedAt: new Date() }, ['cacheKey']);
    } catch (err) {
      this.pino.warn({ cacheKey, err }, 'Rule data persist failed');
    }
  }
}

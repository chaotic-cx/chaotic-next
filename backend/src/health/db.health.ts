import { errorMessage } from '../utils/functions';
import { HealthCheckError, type HealthIndicatorResult } from './health.types';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DbHealthIndicator {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Checks the DB directly instead of via `TypeOrmHealthIndicator`, whose
   * deep import into `@nestjs/typeorm/dist` is blocked by that package's
   * `exports` map since v12.
   */
  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.dataSource.query('SELECT 1');
      return { [key]: { status: 'up' } };
    } catch (err) {
      throw new HealthCheckError('Database check failed', {
        [key]: { status: 'down', message: errorMessage(err) },
      });
    }
  }
}

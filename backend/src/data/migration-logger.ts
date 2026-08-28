import { Logger as NestLogger } from '@nestjs/common';
import { type Logger as TypeOrmLogger } from 'typeorm';

export class MigrationLogger implements TypeOrmLogger {
  private readonly logger = new NestLogger('Migrations');

  log(level: 'log' | 'info' | 'warn', message: unknown): void {
    if (level === 'warn') {
      this.logger.warn(message);
    } else {
      this.logger.log(message);
    }
  }

  logMigration(message: string): void {
    this.logger.log(message);
  }

  logSchemaBuild(message: string): void {
    this.logger.log(message);
  }

  logWarn(message: string): void {
    this.logger.warn(message);
  }

  logInfo(message: string): void {
    this.logger.log(message);
  }

  logQuery(): void {
    void 0;
  }

  logQueryError(): void {
    void 0;
  }

  logQuerySlow(): void {
    void 0;
  }
}

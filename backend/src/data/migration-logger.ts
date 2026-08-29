import { pino } from 'pino';
import { type Logger as TypeOrmLogger } from 'typeorm';

export class MigrationLogger implements TypeOrmLogger {
  private readonly logger = pino({ name: 'Migrations' });

  log(level: 'log' | 'info' | 'warn', message: unknown): void {
    if (level === 'warn') {
      this.logWarn(message);
    } else {
      this.logInfo(message);
    }
  }

  logMigration(message: string): void {
    this.logInfo(message);
  }

  logSchemaBuild(message: string): void {
    this.logInfo(message);
  }

  logWarn(message: unknown): void {
    this.logger.warn(this.asMessage(message));
  }

  logInfo(message: unknown): void {
    this.logger.info(this.asMessage(message));
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

  private asMessage(message: unknown): string {
    return typeof message === 'string' ? message : JSON.stringify(message);
  }
}

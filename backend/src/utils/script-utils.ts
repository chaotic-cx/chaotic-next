import { type INestApplicationContext, Logger, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';

export async function bootstrapScript(logLevels: LogLevel[]): Promise<INestApplicationContext> {
  Logger.overrideLogger(logLevels);
  return NestFactory.createApplicationContext(AppModule, { logger: logLevels });
}

export function runScript(main: () => Promise<void>): void {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  });
}

import { Logger } from '@nestjs/common';

export function silenceNestLogger(): void {
  Logger.overrideLogger(false);
  for (const level of ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const) {
    Logger.prototype[level] = () => undefined;
  }
}

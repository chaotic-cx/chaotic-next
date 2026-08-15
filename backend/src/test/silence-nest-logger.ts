import { Logger } from '@nestjs/common';

// Silent the NestJS logger so test output is limited to test results. The
// per-instance methods are stubbed (rather than overrideLogger, which is
// deprecated and version-sensitive) so every service logger is silenced.
for (const level of ['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const) {
  Logger.prototype[level] = () => undefined;
}

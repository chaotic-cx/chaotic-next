import { Logger } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

// Silence the NestJS logger so test output is limited to test results. The
// per-instance methods are stubbed (rather than overrideLogger, which is
// deprecated and version-sensitive) so every service logger is silenced.
for (const level of ['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const) {
  Logger.prototype[level] = () => undefined;
}

// PinoLogger routes every level through call(); stubbing it silences the
// @InjectPinoLogger loggers that bypass the NestJS Logger entirely.
(PinoLogger.prototype as unknown as { call: () => undefined }).call = () => undefined;

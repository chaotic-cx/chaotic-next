import { Logger } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

Logger.overrideLogger(false);
for (const level of ['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const) {
  Logger.prototype[level] = () => undefined;
}

// PinoLogger routes every level through call(); stubbing it silences the
// @InjectPinoLogger loggers that bypass the NestJS Logger entirely.
(PinoLogger.prototype as unknown as { call: () => undefined }).call = () => undefined;

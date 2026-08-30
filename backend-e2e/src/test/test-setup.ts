import { PinoLogger } from 'nestjs-pino';
import { silenceNestLogger } from './silence-nest-logger';

silenceNestLogger();

// PinoLogger routes every level through call(); stubbing it silences the
// @InjectPinoLogger loggers that bypass the NestJS Logger entirely.
(PinoLogger.prototype as unknown as { call: () => undefined }).call = () => undefined;

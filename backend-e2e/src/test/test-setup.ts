import { Logger } from '@nestjs/common';

Logger.overrideLogger(false);
Logger.prototype.error = () => undefined;
Logger.prototype.log = () => undefined;
Logger.prototype.warn = () => undefined;
Logger.prototype.debug = () => undefined;
Logger.prototype.verbose = () => undefined;
Logger.prototype.fatal = () => undefined;

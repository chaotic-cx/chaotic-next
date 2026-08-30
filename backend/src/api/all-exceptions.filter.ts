import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

const GITLAB_STATUS_REGEX = /^(\d{3})\s/;

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(AllExceptionsFilter.name) private readonly pino: PinoLogger) {}

  private static gitlabErrorStatus(exception: unknown): number | undefined {
    if (typeof exception !== 'object' || exception === null) return undefined;
    const candidate = exception as { name?: unknown; message?: unknown };
    if (candidate.name !== 'GitbeakerRequestError' || typeof candidate.message !== 'string') return undefined;
    return Number(candidate.message.match(GITLAB_STATUS_REGEX)?.[1]) || undefined;
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const gitlabStatus = AllExceptionsFilter.gitlabErrorStatus(exception);
    const status =
      gitlabStatus ?? (exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);

    const message =
      gitlabStatus !== undefined
        ? (exception as Error).message
        : exception instanceof HttpException
          ? exception.getResponse()
          : exception instanceof Error
            ? exception.message
            : 'Internal server error';

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.pino.error(
        { err: exception, requestMethod: request.method, requestUrl: request.url },
        'Unhandled exception',
      );
    }

    const errorCode = exception instanceof HttpException ? exception.errorCode : undefined;
    const errorBody =
      exception instanceof HttpException && typeof exception.getResponse() === 'object'
        ? (exception.getResponse() as Record<string, unknown>)
        : undefined;
    const errors = Array.isArray(errorBody?.['errors']) ? (errorBody?.['errors'] as unknown[]) : undefined;
    const errorResponseBody: {
      statusCode: number;
      timestamp: string;
      path: string;
      message: unknown;
      errorCode?: string;
      errors?: unknown[];
    } = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: typeof message === 'object' ? ((message as Record<string, unknown>).message ?? message) : message,
      ...(errorCode !== undefined ? { errorCode } : {}),
      ...(errors !== undefined ? { errors } : {}),
    };

    void response.status(status).send(errorResponseBody);
  }
}

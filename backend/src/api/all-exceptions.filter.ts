import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

const GITLAB_STATUS_REGEX = /^(\d{3})\s/;

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

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
      this.logger.error(
        `Unhandled Exception on ${request.method} ${request.url}: ${
          exception instanceof Error ? exception.stack : String(exception)
        }`,
      );
    } else if (status === HttpStatus.NOT_FOUND) {
      this.logger.debug(
        `HttpException [${status}] on ${request.method} ${request.url}: ${
          typeof message === 'object' ? JSON.stringify(message) : message
        }`,
      );
    } else {
      this.logger.warn(
        `HttpException [${status}] on ${request.method} ${request.url}: ${
          typeof message === 'object' ? JSON.stringify(message) : message
        }`,
      );
    }

    const errorResponseBody = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: typeof message === 'object' ? ((message as Record<string, unknown>).message ?? message) : message,
    };

    void response.status(status).send(errorResponseBody);
  }
}

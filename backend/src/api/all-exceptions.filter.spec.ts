import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { describe, expect, it, vi } from 'vitest';

const pinoStub = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as PinoLogger;

describe('AllExceptionsFilter', () => {
  it('catches HttpExceptions and formats structured response', () => {
    const filter = new AllExceptionsFilter(pinoStub);
    const send = vi.fn();
    const status = vi.fn(() => ({ send }));

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'GET', url: '/test-url' }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new HttpException('Forbidden Access', HttpStatus.FORBIDDEN), host);

    expect(status).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        path: '/test-url',
        message: 'Forbidden Access',
      }),
    );
  });

  it('catches generic unhandled errors as 500 Internal Server Error', () => {
    const filter = new AllExceptionsFilter(pinoStub);
    const send = vi.fn();
    const status = vi.fn(() => ({ send }));

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'POST', url: '/admin/recompute' }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new Error('Unexpected DB Connection Failure'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        path: '/admin/recompute',
        message: 'Unexpected DB Connection Failure',
      }),
    );
  });

  it('passes through the GitLab status code for GitbeakerRequestError', () => {
    const filter = new AllExceptionsFilter(pinoStub);
    const send = vi.fn();
    const status = vi.fn(() => ({ send }));

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'POST', url: '/gitlab/trigger' }),
      }),
    } as unknown as ArgumentsHost;

    const gitlabError = new Error('403 Forbidden');
    gitlabError.name = 'GitbeakerRequestError';

    filter.catch(gitlabError, host);

    expect(status).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        path: '/gitlab/trigger',
        message: '403 Forbidden',
      }),
    );
  });
});

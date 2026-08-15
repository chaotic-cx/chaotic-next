import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { describe, expect, it, vi } from 'vitest';

describe('AllExceptionsFilter', () => {
  it('catches HttpExceptions and formats structured response', () => {
    const filter = new AllExceptionsFilter();
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
    const filter = new AllExceptionsFilter();
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
});

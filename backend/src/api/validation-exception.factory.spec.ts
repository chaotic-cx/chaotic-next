import { describe, expect, it } from 'vitest';
import { validationExceptionFactory } from './validation-exception.factory';

describe('validationExceptionFactory', () => {
  it('builds a joined message with per-field paths and a validation error code', () => {
    const exception = validationExceptionFactory([
      { path: ['query', 'days'], message: 'Invalid input: expected number, received string' },
      { message: 'Required' },
    ]);

    expect(exception.getStatus()).toBe(400);
    expect(exception.errorCode).toBe('VALIDATION_FAILED');

    const body = exception.getResponse() as { message: string; errors: { path?: string; message: string }[] };
    expect(body.message).toBe('query.days: Invalid input: expected number, received string; Required');
    expect(body.errors).toEqual([
      { path: 'query.days', message: 'Invalid input: expected number, received string' },
      { path: undefined, message: 'Required' },
    ]);
  });

  it('keeps the message readable for a single issue', () => {
    const exception = validationExceptionFactory([{ message: 'Unrecognized key: "failureSilenced"' }]);

    const body = exception.getResponse() as { message: string };
    expect(body.message).toBe('Unrecognized key: "failureSilenced"');
  });
});

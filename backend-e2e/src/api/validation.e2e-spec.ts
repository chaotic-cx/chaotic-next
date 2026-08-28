import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

interface ValidationBody {
  message: string;
  errorCode: string;
  errors: { path?: string; message: string }[];
}

describe('Standard Schema validation errors (e2e, real PostgreSQL)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  it('rejects a non-numeric query value with a structured 400', async () => {
    const res = await e2e.inject({ method: 'GET', url: '/metrics/users?days=abc' });

    expect(res.statusCode).toBe(400);
    const body = (await res.json()) as ValidationBody;
    expect(body.errorCode).toBe('VALIDATION_FAILED');
    expect(body.message).toContain('days');
    expect(body.errors[0]?.path).toBe('days');
  });

  it('rejects an unknown query key with the key named in the message', async () => {
    const res = await e2e.inject({ method: 'GET', url: '/metrics/users?days=30&nonsense=1' });

    expect(res.statusCode).toBe(400);
    const body = (await res.json()) as ValidationBody;
    expect(body.errorCode).toBe('VALIDATION_FAILED');
    expect(body.message).toContain('nonsense');
  });

  it('rejects an invalid create-repo body with per-field errors', async () => {
    const res = await e2e.inject({
      method: 'POST',
      url: '/admin/repos',
      payload: { name: '' },
    });

    expect(res.statusCode).toBe(400);
    const body = (await res.json()) as ValidationBody;
    expect(body.errorCode).toBe('VALIDATION_FAILED');
    expect(body.errors).toContainEqual({ path: 'name', message: expect.stringContaining('character') });
    expect(body.message).toContain('name:');
  });
});

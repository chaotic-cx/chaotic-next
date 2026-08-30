import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

describe('Root endpoint (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  it('GET / greets with the backend version', async () => {
    const res = await e2e.inject({
      method: 'GET',
      url: '/',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(String(res.body)).toMatch(/^Hello from chaotic-backend v/);
  });
});

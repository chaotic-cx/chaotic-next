import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

describe('Health endpoint (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  it('GET /health returns 200 with ok status when the DB is reachable', async () => {
    const res = await e2e.inject<{ status: string; info: Record<string, { status: string }> }>({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = await res.json();

    expect(body.status).toBe('ok');
    expect(body.info.db.status).toBe('up');
  });
});

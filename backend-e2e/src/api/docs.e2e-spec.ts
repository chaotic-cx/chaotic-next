import { provideSwagger } from '@chaotic-next/backend/api/setup-swagger';
import { AppModule } from '@chaotic-next/backend/app.module';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('OpenAPI document (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false });
    provideSwagger(app);
    await app.init();
    await app.listen(0);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves an OpenAPI 3.2 document with descriptions from the shared schemas', async () => {
    const spec = await app.inject({ method: 'GET', url: '/api/docs/json' });
    expect(spec.statusCode).toBe(200);
    expect(spec.headers['content-type']).toContain('application/json');

    const doc = JSON.parse(spec.payload) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(doc.openapi).toBe('3.2.0');

    // Response schema converted from the shared zod schema, with descriptions.
    expect(JSON.stringify(doc.paths['/builder/builds'])).toContain('Page of entries');

    // Request query schema descriptions survive conversion.
    expect(JSON.stringify(doc.paths['/metrics/users'])).toContain('Lookback window');
  });

  it('serves the reference UI on /api/docs without swallowing the JSON route', async () => {
    const ui = await app.inject({ method: 'GET', url: '/api/docs' });
    expect(ui.statusCode).toBe(200);
    const spec = await app.inject({ method: 'GET', url: '/api/docs/json' });
    expect(spec.headers['content-type']).toContain('application/json');
  });
});

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { provideSwagger } from '@chaotic-next/backend/api/setup-swagger';
import { AppModule } from '@chaotic-next/backend/app.module';
import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('dump openapi', () => {
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
  it('writes /tmp/openapi3.json', async () => {
    const spec = await app.inject({ method: 'GET', url: '/api/docs/json' });
    writeFileSync('/tmp/openapi3.json', spec.payload);
    expect(spec.statusCode).toBe(200);
  });
});

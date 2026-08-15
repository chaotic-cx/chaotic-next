import { AppModule } from '@chaotic-next/backend/app.module';
import { auth } from '@chaotic-next/backend/auth/auth';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Better Auth & Security Configurations (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('Better Auth Hardening Options', () => {
    it('enforces memory rate limiting in production auth config', () => {
      expect(auth.options.rateLimit?.enabled).toBe(true);
      expect(auth.options.rateLimit?.storage).toBe('memory');
      expect(auth.options.rateLimit?.window).toBe(60);
      expect(auth.options.rateLimit?.max).toBe(100);
    });

    it('enforces OAuth token encryption for stored third-party credentials', () => {
      expect(auth.options.account?.encryptOAuthTokens).toBe(true);
      expect(auth.options.account?.storeStateStrategy).toBe('cookie');
    });

    it('configures default cookie security attributes with Lax sameSite policy', () => {
      expect(auth.options.advanced?.defaultCookieAttributes?.sameSite).toBe('lax');
    });

    it('parses reverse proxy IP headers (x-forwarded-for, x-real-ip)', () => {
      expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(['x-forwarded-for', 'x-real-ip']);
    });
  });

  describe('Trusted Origins Security', () => {
    it('configures trustedOrigins whitelist preventing unauthorized origins', () => {
      expect(auth.options.trustedOrigins).toEqual(['http://localhost:4201', 'https://aur.chaotic.cx']);
    });
  });

  describe('Session Security & Rate Limiting Verification', () => {
    const TEST_REQUEST_COUNT = 105;
    const LAST_ALLOWED_INDEX = 99;
    const FIRST_RATE_LIMITED_INDEX = 100;
    const FINAL_RATE_LIMITED_INDEX = 104;

    it('enforces 429 Too Many Requests when request limit is exceeded', async () => {
      const responses: number[] = [];

      for (let i = 0; i < TEST_REQUEST_COUNT; i++) {
        const res = await app.inject({
          method: 'GET',
          url: '/api/auth/ok',
        });
        responses.push(res.statusCode);
      }

      expect(responses[0]).toBe(200);
      expect(responses[LAST_ALLOWED_INDEX]).toBe(200);

      expect(responses[FIRST_RATE_LIMITED_INDEX]).toBe(429);
      expect(responses[FINAL_RATE_LIMITED_INDEX]).toBe(429);
    });
  });
});

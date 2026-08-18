import { Controller, Get, UseGuards } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AuthGuard, AuthModule } from '@thallesp/nestjs-better-auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth } from './auth';

@Controller('test-auth')
class TestAuthController {
  @Get('public')
  publicEndpoint() {
    return { ok: true, message: 'public' };
  }

  @Get('protected')
  @UseGuards(AuthGuard)
  protectedEndpoint() {
    return { ok: true, message: 'protected' };
  }
}

describe('Auth Configuration & Guard Protection', () => {
  it('should expose valid Better Auth configuration options', () => {
    expect(auth.options.appName).toBe('Chaotic-AUR');
    expect(auth.options.rateLimit?.enabled).toBe(true);
    expect(auth.options.rateLimit?.storage).toBe('memory');
    expect(auth.options.account?.encryptOAuthTokens).toBe(true);
    expect(auth.options.advanced?.defaultCookieAttributes?.sameSite).toBe('lax');
  });

  describe('Route protection (AuthGuard)', () => {
    let app: NestFastifyApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AuthModule.forRoot({ auth, disableGlobalAuthGuard: true })],
        controllers: [TestAuthController],
      }).compile();

      app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('allows access to public endpoints (200 OK)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/test-auth/public',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toEqual({ ok: true, message: 'public' });
    });

    it('rejects unauthenticated requests to guarded endpoints with 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/test-auth/protected',
      });

      expect(res.statusCode).toBe(401);
    });
  });
});

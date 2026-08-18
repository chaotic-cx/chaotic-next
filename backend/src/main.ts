import { CAUR_ALLOWED_CORS } from '@chaotic-next/shared-lib';
import helmet from '@fastify/helmet';
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';
import { provideSwagger } from './api/setup-swagger';
import { AppModule } from './app.module';
import { checkEnvironment } from './utils/functions';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

async function bootstrap(): Promise<void> {
  // Fastify only understands a boolean or an address/CIDR here, so the env
  // strings "true"/"false" are mapped to booleans before being passed on.
  const trustProxyEnv = process.env.CAUR_TRUST_PROXY;
  const trustProxy = trustProxyEnv === 'true' ? true : trustProxyEnv === 'false' ? false : trustProxyEnv;

  const fastifyAdapter = new FastifyAdapter(trustProxy === undefined ? undefined : { trustProxy });
  const app: INestApplication = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();

  const configService: ConfigService = app.get<ConfigService>(ConfigService);
  checkEnvironment(configService);

  // Two fastify majors' type declarations coexist in the dependency tree
  // (@nestjs/platform-fastify pins an older one than @fastify/helmet expects),
  // so the plugin is narrowed to exactly what the adapter's register() takes.
  type AdapterPlugin = Parameters<FastifyAdapter['register']>[0];
  fastifyAdapter.register(helmet as unknown as AdapterPlugin);

  const corsOptions = {
    origin: CAUR_ALLOWED_CORS,
    methods: 'GET,POST,PATCH,DELETE',
  };
  app.enableCors(corsOptions);

  provideSwagger(app);
  await app.listen(configService.getOrThrow<number>('app.port'), configService.getOrThrow<string>('app.host'));
}

bootstrap().then(() => {
  Logger.log('🚀 Application has started up', 'Bootstrap');
});

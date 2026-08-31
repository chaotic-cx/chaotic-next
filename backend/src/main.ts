import { CAUR_ALLOWED_CORS } from '@chaotic-next/shared-lib';
import helmet from '@fastify/helmet';
import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { provideSwagger } from './api/setup-swagger';
import { AppModule, ObserveInstrument } from './app.module';
import { checkEnvironment } from './utils/functions';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

async function bootstrap(): Promise<void> {
  // Fastify accepts a boolean or an address/CIDR here. This code maps the
  // env strings "true"/"false" to booleans and passes other values through.
  const trustProxyEnv = process.env.CAUR_TRUST_PROXY;
  const trustProxy = trustProxyEnv === 'true' ? true : trustProxyEnv === 'false' ? false : trustProxyEnv;

  const fastifyAdapter = new FastifyAdapter(trustProxy === undefined ? undefined : { trustProxy });
  const app: INestApplication = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter, {
    bufferLogs: true,
    instrument: ObserveInstrument,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks();

  const configService: ConfigService = app.get<ConfigService>(ConfigService);
  checkEnvironment(configService);

  // Two fastify majors' type declarations coexist in the dependency tree
  // (@nestjs/platform-fastify pins an older one than @fastify/helmet expects),
  // so the plugin is narrowed to exactly what the adapter's register() takes.
  type AdapterPlugin = Parameters<FastifyAdapter['register']>[0];
  fastifyAdapter.register(helmet as unknown as AdapterPlugin, {
    // The Scalar API reference loads its assets from cdn.jsdelivr.net
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'https://fonts.scalar.com'],
        connectSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://backend.chaotic.cx'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  const corsOptions = {
    origin: CAUR_ALLOWED_CORS,
    methods: 'GET,POST,PATCH,DELETE,OPTIONS',
    credentials: true,
  };
  app.enableCors(corsOptions);

  provideSwagger(app);
  await app.listen(configService.getOrThrow<number>('app.port'), configService.getOrThrow<string>('app.host'));
  logger.log('🚀 Application has started up');
}

void bootstrap();

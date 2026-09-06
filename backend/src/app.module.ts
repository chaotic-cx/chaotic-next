import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './admin/admin.module';
import { AllExceptionsFilter } from './api/all-exceptions.filter';
import { ThrottlerBehindProxyGuard } from './api/throttler-behind-proxy.guard';
import { validationExceptionFactory } from './api/validation-exception.factory';
import { AppController } from './app.controller';
import { AurModule } from './aur/aur.module';
import { auth } from './auth/auth';
import { BuilderModule } from './builder/builder.module';
import { lruCacheModule } from './cache/lru-cache.module';
import appConfig from './config/app.config';
import { envValidationSchema } from './config/env.validation';
import portableBuilderConfig from './config/portable-builder.config';
import { dataSourceOptions } from './data/data.source';
import { MigrationLogger } from './data/migration-logger';
import { GitlabModule } from './gitlab/gitlab.module';
import { HealthModule } from './health/health.module';
import { IssueTrackerModule } from './issue-tracker/issue-tracker.module';
import { MetricsModule } from './metrics/metrics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PortableBuilderModule } from './portable-builder/portable-builder.module';
import { RepoManagerModule } from './repo-manager/repo-manager.module';
import { RouterModule } from './router/router.module';
import { THROTTLE_LIMIT, THROTTLE_TTL_MS } from './utils/constants';

@Module({
  imports: [
    AdminModule,
    AurModule,
    AuthModule.forRoot({ auth, disableGlobalAuthGuard: true, bodyParser: { rawBody: true } }),
    BuilderModule,
    lruCacheModule(),
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
      load: [appConfig, portableBuilderConfig],
      validationSchema: envValidationSchema,
    }),
    HealthModule,
    IssueTrackerModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        ...(process.env.NODE_ENV === 'production'
          ? {}
          : {
              transport: {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'SYS:standard',
                  ignore: 'pid,hostname',
                  singleLine: true,
                  errorLikeObjectKeys: [],
                },
              },
            }),
        redact: {
          paths: [
            'req.headers["x-gitlab-private-token"]',
            'req.headers["x-gitlab-token"]',
            'req.headers.authorization',
            'req.headers.cookie',
          ],
          remove: true,
        },
      },
      forRoutes: process.env.HTTP_LOGGING === 'true' ? undefined : [],
    }),
    MetricsModule,
    NotificationsModule,
    PortableBuilderModule,
    RepoManagerModule,
    RouterModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: THROTTLE_TTL_MS,
        limit: THROTTLE_LIMIT,
      },
    ]),
    TypeOrmModule.forRoot({ ...dataSourceOptions, autoLoadEntities: true, logger: new MigrationLogger() }),
    GitlabModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new StandardSchemaValidationPipe({ exceptionFactory: validationExceptionFactory }),
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}

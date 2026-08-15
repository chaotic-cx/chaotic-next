import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerBehindProxyGuard } from './api/throttler-behind-proxy.guard';
import { auth } from './auth/auth';
import { BuilderModule } from './builder/builder.module';
import appConfig from './config/app.config';
import { dataSourceOptions } from './data/data.source';
import { GitlabModule } from './gitlab/gitlab.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RepoManagerModule } from './repo-manager/repo-manager.module';
import { RouterModule } from './router/router.module';
import { THROTTLE_LIMIT, THROTTLE_TTL_MS } from './utils/constants';

@Module({
  imports: [
    AuthModule.forRoot({ auth, disableGlobalAuthGuard: true }),
    BuilderModule,
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true, load: [appConfig] }),
    HealthModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
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
    RepoManagerModule,
    RouterModule,
    ScheduleModule.forRoot(),
    TerminusModule,
    ThrottlerModule.forRoot([
      {
        ttl: THROTTLE_TTL_MS,
        limit: THROTTLE_LIMIT,
      },
    ]),
    TypeOrmModule.forRoot({ ...dataSourceOptions, autoLoadEntities: true }),
    GitlabModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
  ],
})
export class AppModule {}

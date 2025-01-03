import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { BuilderModule } from './builder/builder.module';
import appConfig from './config/app.config';
import { dataSourceOptions } from './data.source';
import { MetricsModule } from './metrics/metrics.module';
import { RepoManagerModule } from './repo-manager/repo-manager.module';
import { RouterModule } from './router/router.module';
import { UsersModule } from './users/users.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { GitlabModule } from './gitlab/gitlab.module';

@Module({
  imports: [
    AuthModule,
    BuilderModule,
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true, load: [appConfig] }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
      },
      // By default, off, but can be enabled by setting HTTP_LOGGING=true
      forRoutes: process.env.HTTP_LOGGING === 'true' ? undefined : [],
    }),
    MetricsModule,
    RepoManagerModule,
    RouterModule,
    ScheduleModule.forRoot(),
    TerminusModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    TypeOrmModule.forRoot({ ...dataSourceOptions, autoLoadEntities: true }),
    UsersModule,
    GitlabModule,
  ],
})
export class AppModule {}

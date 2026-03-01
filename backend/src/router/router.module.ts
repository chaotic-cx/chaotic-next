import { Module } from '@nestjs/common';
import { RouterController } from './router.controller';
import { RouterService } from './router.service';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerBehindProxyGuard } from '../api/throttler-behind-proxy.guard';

@Module({
  controllers: [RouterController],
  providers: [
    RouterService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
  ],
})
export class RouterModule {}

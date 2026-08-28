import { RouterController } from './router.controller';
import { RouterService } from './router.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [RouterController],
  exports: [RouterService],
  providers: [RouterService],
})
export class RouterModule {}

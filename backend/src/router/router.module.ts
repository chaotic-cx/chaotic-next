import { Module } from '@nestjs/common';
import { RouterController } from './router.controller';
import { RouterService } from './router.service';

@Module({
  controllers: [RouterController],
  exports: [RouterService],
  providers: [RouterService],
})
export class RouterModule {}

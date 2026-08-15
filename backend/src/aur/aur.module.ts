import { Module } from '@nestjs/common';
import { AurController } from './aur.controller';
import { AurService } from './aur.service';

@Module({
  controllers: [AurController],
  providers: [AurService],
})
export class AurModule {}

import { AurController } from './aur.controller';
import { AurService } from './aur.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AurController],
  providers: [AurService],
})
export class AurModule {}

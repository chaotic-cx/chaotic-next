import type { PkgListRetObject } from '@./shared-lib';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { AllowAnonymous } from '../auth/anonymous.decorator';
import { MiscService } from './misc.service';

@Controller('misc')
@UseInterceptors(CacheInterceptor)
export class MiscController {
  constructor(private miscService: MiscService) {}

  @AllowAnonymous()
  @Get('pkglist')
  getPkgList(): Promise<PkgListRetObject> {
    return this.miscService.getPkgList();
  }
}

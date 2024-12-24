import { CacheInterceptor } from '@nestjs/cache-manager';
import { Controller, Get, Param, UseInterceptors } from '@nestjs/common';
import { AllowAnonymous } from '../auth/anonymous.decorator';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@UseInterceptors(CacheInterceptor)
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  @AllowAnonymous()
  @Get('30d/users')
  thirtyDayUsers(): any {
    return this.metricsService.thirtyDayUsers();
  }

  @AllowAnonymous()
  @Get('30d/user-agents')
  thirtyDayUserAgents(): any {
    return this.metricsService.thirtyDayUserAgents();
  }

  @AllowAnonymous()
  @Get('30d/package/:package')
  thirtyDayPackage(@Param() params: any): any {
    return this.metricsService.thirtyDayPackage(params.package);
  }

  @AllowAnonymous()
  @Get('30d/rank/:range/countries')
  thirtyDayRankCountries(@Param() params: any): any {
    return this.metricsService.rankCountries(params.range);
  }

  @AllowAnonymous()
  @Get('30d/rank/:range/packages')
  thirtyDayRankPackages(@Param() params: any): any {
    return this.metricsService.rankPackages(params.range);
  }
}

import { CacheInterceptor } from '@nestjs/cache-manager';
import { Controller, Get, Param, UseInterceptors } from '@nestjs/common';
import { AllowAnonymous } from '../auth/anonymous.decorator';
import { MetricsService } from './metrics.service';
import { ApiTags, ApiOkResponse, ApiParam, ApiOperation, ApiExtraModels } from '@nestjs/swagger';

@ApiTags('metrics')
@Controller('metrics')
@UseInterceptors(CacheInterceptor)
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  @AllowAnonymous()
  @Get('30d/users')
  @ApiOperation({ summary: 'Get unique user count for the last 30 days.' })
  @ApiOkResponse({ description: '30d user count', type: Number, isArray: true })
  thirtyDayUsers(): any {
    return this.metricsService.thirtyDayUsers();
  }

  @AllowAnonymous()
  @Get('30d/user-agents')
  @ApiOperation({ summary: 'Get user agent statistics for the last 30 days.' })
  @ApiOkResponse({ description: '30d user agent stats', type: Array })
  thirtyDayUserAgents(): any {
    return this.metricsService.thirtyDayUserAgents();
  }

  @AllowAnonymous()
  @Get('30d/package/:package')
  @ApiOperation({ summary: 'Get download and user agent stats for a specific package over the last 30 days.' })
  @ApiParam({ name: 'package', description: 'Package name to get metrics for', required: true })
  @ApiOkResponse({ description: 'Metrics for a specific package' })
  thirtyDayPackage(@Param('package') pkg: string): any {
    return this.metricsService.thirtyDayPackage(pkg);
  }

  @AllowAnonymous()
  @Get('30d/rank/:range/countries')
  @ApiOperation({ summary: 'Get country ranking for a given range in the last 30 days.' })
  @ApiParam({ name: 'range', description: 'Range (e.g. top 10)', required: true })
  @ApiOkResponse({ description: 'Country rank list', type: Array })
  thirtyDayRankCountries(@Param('range') range: string): any {
    return this.metricsService.rankCountries(range);
  }

  @AllowAnonymous()
  @Get('30d/rank/:range/packages')
  @ApiOperation({ summary: 'Get package ranking for a given range in the last 30 days.' })
  @ApiParam({ name: 'range', description: 'Range (e.g. top 10)', required: true })
  @ApiOkResponse({ description: 'Package rank list', type: Array })
  thirtyDayRankPackages(@Param('range') range: string): any {
    return this.metricsService.rankPackages(range);
  }
}

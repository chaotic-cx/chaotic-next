import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { BuildStatus } from '@chaotic-next/shared-lib';

export class GetPackagesQueryDto {
  @ApiPropertyOptional({ description: 'Add repo information to the result' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  repo?: boolean = false;

  @ApiPropertyOptional({ description: 'Filter packages by repository id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  repoId?: number;

  @ApiPropertyOptional({ description: 'Page number, 1-based' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ description: 'Rows per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  perPage?: number;

  @ApiPropertyOptional({ description: 'Search query matching pkgname, description or URL' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Sort field (pkgname, lastUpdated, version, repo)' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ description: 'Sort order (ASC or DESC)' })
  @IsOptional()
  @IsString()
  order?: string;
}

export class GetBuildsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by builder name' })
  @IsOptional()
  @IsString()
  builder?: string;

  @ApiPropertyOptional({ description: 'Filter by repository name' })
  @IsOptional()
  @IsString()
  repo?: string;

  @ApiPropertyOptional({ description: 'Filter by build status', enum: BuildStatus, enumName: 'BuildStatus' })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(BuildStatus)
  status?: BuildStatus;

  @ApiPropertyOptional({ description: 'Page number, 1-based' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ description: 'Rows per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  perPage?: number;

  @ApiPropertyOptional({ description: 'Search query matching pkgname, builder, repo or commit' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description:
      'Sort field (id, timestamp, timeToEnd, pkgname, builder, repo, status, peakMemory, cpuTime, diskIo, networkIo)',
  })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ description: 'Sort order (ASC or DESC)' })
  @IsOptional()
  @IsString()
  order?: string;
}

export class BuildWithUrlDto {
  @ApiProperty({ description: 'Commit hash' })
  @IsString()
  commit!: string;

  @ApiProperty({ description: 'Build log URL' })
  @IsString()
  logUrl!: string;

  @ApiProperty({ description: 'Package name' })
  @IsString()
  pkgname!: string;

  @ApiProperty({ description: 'Time to end (human-readable)' })
  @IsString()
  timeToEnd!: string;

  @ApiProperty({ description: 'Package version' })
  @IsString()
  version!: string;
}

export class PkgCountDto {
  @ApiProperty({ description: 'Package base name' })
  @IsString()
  pkgbase!: string;

  @ApiProperty({ description: 'Number of builds' })
  @IsString()
  count!: string;
}

export class BuilderCountDto {
  @ApiProperty({ description: 'Builder name' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Number of builds' })
  @IsString()
  count!: string;
}

export class DayRepoCountDto {
  @ApiProperty({ description: 'Day (YYYY-MM-DD)' })
  @IsString()
  day!: string;

  @ApiProperty({ description: 'Repository name' })
  @IsString()
  repo!: string;

  @ApiProperty({ description: 'Number of builds' })
  @IsString()
  count!: string;
}

export class DayAverageDto {
  @ApiProperty({ description: 'Day (YYYY-MM-DD)' })
  @IsString()
  day!: string;

  @ApiProperty({ description: 'Average build time (seconds)' })
  @IsString()
  average!: string;
}

export class PopularPackageDto {
  @ApiProperty({ description: 'Package base and name' })
  @IsString()
  pkgbase_pkgname!: string;

  @ApiProperty({ description: 'Number of builds' })
  @IsString()
  count!: string;
}

export class DayCountDto {
  @ApiProperty({ description: 'Day (YYYY-MM-DD)' })
  @IsString()
  day!: string;

  @ApiProperty({ description: 'Number of builds' })
  @IsString()
  count!: string;
}

export class DayStatusAverageDto {
  @ApiProperty({ description: 'Day (YYYY-MM-DD)' })
  @IsString()
  day!: string;

  @ApiProperty({ description: 'Build status' })
  @IsString()
  status!: string;

  @ApiProperty({ description: 'Average build time (seconds)' })
  @IsString()
  average!: string;
}

export class FailedBuildHotspotDto {
  @ApiProperty({ description: 'Package name' })
  @IsString()
  pkgname!: string;

  @ApiProperty({ description: 'Number of failed builds' })
  @IsString()
  count!: string;
}

export class FailedBuildOverTimeDto {
  @ApiProperty({ description: 'Day (YYYY-MM-DD)' })
  @IsString()
  day!: string;

  @ApiProperty({ description: 'Package name' })
  @IsString()
  pkgname!: string;

  @ApiProperty({ description: 'Number of failed builds' })
  @IsString()
  count!: string;
}

export class ShouldBuildDto {
  @ApiProperty({ description: 'Whether dispatching a build is likely to succeed' })
  @IsBoolean()
  shouldBuild!: boolean;

  @ApiProperty({ description: 'Consecutive failures behind the decision' })
  @IsInt()
  consecutiveFailures!: number;
}

export class FlakyPackageDto {
  @ApiProperty({ description: 'Package name' })
  @IsString()
  pkgname!: string;

  @ApiProperty({ description: 'Genuine build attempts inside the window' })
  @IsInt()
  attempts!: number;

  @ApiProperty({ description: 'Failed builds inside the window' })
  @IsInt()
  failures!: number;

  @ApiProperty({ description: 'Failure rate from 0 to 1' })
  @IsNumber()
  flakiness!: number;
}

export class BuilderUtilizationDto {
  @ApiProperty({ description: 'Builder name' })
  @IsString()
  builder!: string;

  @ApiProperty({ description: 'UTC hour of day (0-23)' })
  @IsInt()
  hour!: number;

  @ApiProperty({ description: 'Builds inside the window for this builder and hour bucket' })
  @IsInt()
  count!: number;
}

export class UnresolvedFailedBuildDto {
  @ApiProperty({ description: 'Package name' })
  @IsString()
  pkgname!: string;

  @ApiProperty({ description: 'Numeric build status of the latest failing build' })
  @IsInt()
  status!: number;

  @ApiProperty({ description: 'Human-readable status label' })
  @IsString()
  statusText!: string;

  @ApiProperty({ description: 'When the latest failing build happened (ISO 8601)' })
  @IsString()
  timestamp!: string;

  @ApiProperty({ description: 'Build log URL, when present', nullable: true })
  @IsOptional()
  @IsString()
  logUrl!: string | null;

  @ApiProperty({ description: 'Failing builds since the last resolving one' })
  @IsInt()
  consecutiveFailures!: number;

  @ApiProperty({ description: 'Whether the failure is silenced until its next failure' })
  @IsBoolean()
  silenced!: boolean;
}

export class HeavyPackageDto {
  @ApiProperty({ description: 'Package name' })
  @IsString()
  pkgname!: string;

  @ApiProperty({ description: 'Average build time (seconds)' })
  @IsString()
  average!: string;
}

export class PackagesPerBuildClassDto {
  @ApiProperty({ description: 'Build class' })
  @IsString()
  build_class!: string;

  @ApiProperty({ description: 'Number of distinct packages built in this class' })
  @IsString()
  count!: string;
}

export class PkgbaseCompositionDto {
  @ApiProperty({ description: "Either 'single' or 'split'" })
  @IsString()
  type!: string;

  @ApiProperty({ description: 'Number of active packages in this group' })
  @IsString()
  count!: string;
}

export class PackageResourceDayDto {
  @ApiProperty({ description: 'Day (YYYY-MM-DD)' })
  @IsString()
  day!: string;

  @ApiProperty({ description: 'Average sampled memory usage per build (bytes)' })
  @IsString()
  avg_memory_bytes!: string;

  @ApiProperty({ description: 'Highest peak memory usage of a single build that day (bytes)' })
  @IsString()
  peak_memory_bytes!: string;

  @ApiProperty({ description: 'Average CPU time consumed per build (nanoseconds)' })
  @IsString()
  cpu_time_ns!: string;

  @ApiProperty({ description: 'Average bytes read from and written to block devices per build' })
  @IsString()
  disk_io_bytes!: string;

  @ApiProperty({ description: 'Average bytes received and sent over the network per build' })
  @IsString()
  network_io_bytes!: string;

  @ApiProperty({ description: 'Number of sampled builds that day' })
  @IsString()
  samples!: string;
}

export class ThroughputDayDto {
  @ApiProperty({ description: 'Day (YYYY-MM-DD)' })
  @IsString()
  day!: string;

  @ApiProperty({ description: 'Successful builds' })
  @IsString()
  success!: string;

  @ApiProperty({ description: 'Already-built (skipped)' })
  @IsString()
  alreadyBuilt!: string;

  @ApiProperty({ description: 'Skipped builds' })
  @IsString()
  skipped!: string;

  @ApiProperty({ description: 'Failed builds' })
  @IsString()
  failed!: string;
}

export class AverageBuildTimeDto {
  @ApiProperty({ description: 'Average build time (seconds)' })
  @IsString()
  average_build_time!: string;

  @ApiProperty({ description: 'Build status' })
  @IsString()
  status!: string;
}

export class AveragePackageBuildTimeDto {
  @ApiProperty({ description: 'Package name' })
  @IsString()
  pkgname!: string;

  @ApiProperty({ description: 'Average build time (seconds)' })
  @IsString()
  average_build_time!: string;

  @ApiProperty({ description: 'Number of samples' })
  @IsString()
  samples!: string;
}

export class GetLatestBuildsQueryDto {
  @ApiPropertyOptional({ description: 'Amount to return' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  amount?: number = 50;

  @ApiPropertyOptional({ description: 'Offset for pagination' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  offset?: number = 0;

  @ApiPropertyOptional({ description: 'Build status', enum: BuildStatus, enumName: 'BuildStatus' })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(BuildStatus)
  status?: BuildStatus;
}

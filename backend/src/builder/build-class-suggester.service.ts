import { BuildStatus } from '../types/types';
import { CACHE_TTL_MS, MAX_DAYS_WINDOW } from '../utils/constants';
import { clampInt, nDaysInPast } from '../utils/functions';
import { SECONDS_PER_MINUTE, suggestBuildClass } from './build-class-suggester';
import { Build } from './builder.entity';
import { BUILD_RESOURCE_COLUMNS } from './resource-stats';
import { type BuildClassSuggestion } from '@chaotic-next/shared-lib';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

/** `Build.timeToEnd` is persisted in minutes; the suggester and API work in seconds. */
const DEFAULT_HISTORY_DAYS = 90;

interface SuggestionRow {
  pkgname: string;
  peak_memory: string | null;
  cpu_time_ns: string | null;
  disk_io: string | null;
  avg_time_to_end_minutes: string | null;
  samples: string;
}

function parseFiniteNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

@Injectable()
export class BuildClassSuggesterService {
  constructor(
    @InjectRepository(Build)
    private readonly buildRepository: Repository<Build>,
  ) {}

  async suggestForPackages(pkgnames: string[], days: number = DEFAULT_HISTORY_DAYS): Promise<BuildClassSuggestion[]> {
    const windowDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    const uniqueNames = [...new Set(pkgnames.map((name) => name.trim()).filter((name) => name.length > 0))];
    if (uniqueNames.length === 0) return [];

    const rows: SuggestionRow[] = await this.buildRepository
      .createQueryBuilder('build')
      .select('pkg.pkgname AS pkgname')
      .addSelect(`AVG(${BUILD_RESOURCE_COLUMNS.peakMemory}) AS peak_memory`)
      .addSelect(`AVG(${BUILD_RESOURCE_COLUMNS.cpuTime}) AS cpu_time_ns`)
      .addSelect(`AVG(${BUILD_RESOURCE_COLUMNS.diskRead} + ${BUILD_RESOURCE_COLUMNS.diskWrite}) AS disk_io`)
      .addSelect('AVG(build.timeToEnd) AS avg_time_to_end_minutes')
      .addSelect('COUNT(*) AS samples')
      .innerJoin('build.pkgbase', 'pkg')
      .where('pkg.pkgname IN (:...pkgnames)', { pkgnames: uniqueNames })
      .andWhere(`${BUILD_RESOURCE_COLUMNS.sampleCount} IS NOT NULL`)
      .andWhere('build.status = :status', { status: BuildStatus.SUCCESS })
      .andWhere('build.timestamp > :date', { date: nDaysInPast(windowDays) })
      .groupBy('pkg.pkgname')
      .orderBy('pkg.pkgname', 'ASC')
      .cache(`build-class-suggestions-${[...uniqueNames].sort().join(',')}-${windowDays}`, CACHE_TTL_MS)
      .getRawMany();

    return rows.map((row) => {
      const timeToEndMinutes = parseFiniteNumber(row.avg_time_to_end_minutes);
      const averages = {
        avgPeakMemoryBytes: parseFiniteNumber(row.peak_memory),
        avgCpuTimeNs: parseFiniteNumber(row.cpu_time_ns),
        avgDiskIoBytes: parseFiniteNumber(row.disk_io),
        avgDurationSeconds: timeToEndMinutes === null ? null : timeToEndMinutes * SECONDS_PER_MINUTE,
      };
      return {
        pkgname: row.pkgname,
        suggestedBuildClass: suggestBuildClass(averages),
        samples: Number(row.samples),
        averages,
      };
    });
  }
}

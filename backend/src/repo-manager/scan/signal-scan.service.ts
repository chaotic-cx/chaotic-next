import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';
import { TriggerType } from '../../interfaces/repo-manager';
import { mapWithConcurrency } from '../../utils/functions';
import { SignalComputeClient } from '../compute/signal-compute.client';
import { PackageElfAnalysis, type PackageElfPkgType } from '../repo-manager.entity';
import { pkgTypeOf } from '../signal';
import { type BrokenFilterEntry, type ImportedAnalysis, type RecomputeBrokenOptions } from './signal-index';
import { scanPackageInWorker, scanWorkerDegradedReason, type ScanOutcome } from './scan-worker';

export interface ScanJob {
  file: string;
  pkgType: TriggerType;
  pkgId: number;
  version: string;
  isSourceCompiled?: boolean;
}

interface ScannedEntry {
  job: ScanJob;
  hasCompiledCode: boolean;
  isSourceCompiled: boolean;
}

export interface ScanFailure {
  job: ScanJob;
  reason: string;
}

export interface ScanReport {
  scanned: number;
  failed: ScanFailure[];
}

type ScanAttempt = { analysis: NonNullable<ScanOutcome['result']> } | { failure: string };

export type { ImportedAnalysis } from './signal-index';

/**
 * Scans package archives with bsdtar/readelf/nm and persists the ELF analysis.
 * Extraction covers executables too (via their `-tvf` mode bits), so their
 * DT_NEEDED feeds dependency detection.
 */
@Injectable()
export class SignalScanService {
  private warnedAboutInlineScans = false;

  constructor(
    @InjectRepository(PackageElfAnalysis)
    private readonly analysisRepository: Repository<PackageElfAnalysis>,
    private readonly compute: SignalComputeClient,
    @InjectPinoLogger(SignalScanService.name) private readonly pino: PinoLogger,
  ) {}

  /**
   * Use a concurrency above 1 only for a full-repo index.
   */
  async scanPackages(jobs: ScanJob[], concurrency = 1): Promise<ScanReport> {
    if (jobs.length === 0) return { scanned: 0, failed: [] };

    const workers = Math.max(1, Math.min(concurrency, jobs.length));
    const failed: ScanFailure[] = [];

    // pluginOf stays empty here. It needs the directory index of the whole batch.
    const scanned = (
      await mapWithConcurrency(
        jobs,
        async (job): Promise<ScannedEntry | null> => {
          const attempt = await this.scanOne(job);
          if ('failure' in attempt) {
            failed.push({ job, reason: attempt.failure });
            return null;
          }

          const { analysis } = attempt;
          const hasCompiledCode = analysis.providedSonames.length > 0 || analysis.neededSonames.length > 0;
          const isSourceCompiled = job.isSourceCompiled ?? false;
          await this.analysisRepository.upsert(
            {
              pkgType: pkgTypeOf(job.pkgType),
              pkgId: job.pkgId,
              version: job.version,
              files: analysis.files,
              neededSonames: analysis.neededSonames,
              providedSonames: analysis.providedSonames,
              importedSymbols: analysis.importedSymbols,
              exportedSymbols: analysis.exportedSymbols,
              providedVersionNodes: analysis.providedVersionNodes,
              neededVersionNodes: analysis.neededVersionNodes,
              vtables: analysis.vtables,
              directoriesOwned: analysis.directoriesOwned,
              directDirectories: analysis.directDirectories,
              pluginOf: [],
              hasCompiledCode: analysis.hasCompiledCode,
              isSourceCompiled,
            },
            ['pkgType', 'pkgId', 'version'],
          );
          return { job, hasCompiledCode, isSourceCompiled };
        },
        workers,
      )
    ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    this.warnOnceAboutInlineScans();

    await this.compute.run('refreshAfterScan', {
      scanned: scanned.map(({ job, hasCompiledCode, isSourceCompiled }) => ({
        pkgType: job.pkgType,
        pkgId: job.pkgId,
        version: job.version,
        hasCompiledCode,
        isSourceCompiled,
      })),
    });

    return { scanned: scanned.length, failed };
  }

  /**
   * Scans on the main thread block requests, so a worker failure must be visible.
   */
  private warnOnceAboutInlineScans(): void {
    const reason = scanWorkerDegradedReason();
    if (!reason || this.warnedAboutInlineScans) return;

    this.warnedAboutInlineScans = true;
    this.pino.error({ reason }, 'Scan workers failed, scanning on the main thread from now on');
  }

  private async scanOne(job: ScanJob): Promise<ScanAttempt> {
    try {
      const { result, warnings } = await scanPackageInWorker({ file: job.file, version: job.version });

      for (const warning of warnings) {
        this.pino.warn(warning);
      }

      return result ? { analysis: result } : { failure: 'the scan returned no analysis' };
    } catch (err) {
      this.pino.error({ err, file: job.file }, 'Failed to scan package');
      return { failure: err instanceof Error ? err.message : String(err) };
    }
  }

  recomputeBroken(filter?: BrokenFilterEntry[], options: RecomputeBrokenOptions = {}): Promise<void> {
    return this.compute.run('recomputeBroken', { filter, options });
  }

  refreshAfterImport(analyses: ImportedAnalysis[]): Promise<void> {
    return this.compute.run('refreshAfterImport', {
      analyses: analyses.map(({ pkgType, pkgId, version }) => ({ pkgType, pkgId, version })),
    });
  }

  recomputePluginOfPkgType(pkgType: PackageElfPkgType): Promise<void> {
    return this.compute.run('recomputePluginOfPkgType', { pkgType });
  }

  invalidateDirectoryIndex(): void {
    this.compute.run('invalidateDirectoryIndex', {}).catch((err: unknown) => {
      this.pino.error({ err }, 'Failed to invalidate the directory index');
    });
  }
}

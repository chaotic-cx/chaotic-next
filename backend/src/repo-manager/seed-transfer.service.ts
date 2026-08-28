import { getOrCreatePackage, getOrCreateRepo, Package, Repo } from '../builder/builder.entity';
import { ArchlinuxPackage, PackageElfAnalysis, type PackageElfPkgType } from './repo-manager.entity';
import { analysisKey, SignalScanService, type ImportedAnalysis } from './scan';
import { ARCH_PKG_TYPE, CHAOTIC_PKG_TYPE } from './signal';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { In, type FindOptionsSelect, type Repository } from 'typeorm';

/** Entries processed per import chunk, to keep memory bounded on huge seeds. */
const IMPORT_BATCH_SIZE = 500;

import { seedEntrySchema, type SeedEntry } from '@chaotic-next/shared-lib';

/**
 * Seed export/import of ELF analyses: dump the stored analyses as a JSON seed
 * (to bootstrap a fresh database), and stream such seeds — or ones produced by
 * the offline indexer — back in. Derived state (directory index, pluginOf,
 * broken flags) is refreshed by SignalScanService after upserting.
 */
@Injectable()
export class SeedTransferService {
  private readonly logger = new Logger(SeedTransferService.name);

  constructor(
    private readonly signalScanService: SignalScanService,
    @InjectRepository(PackageElfAnalysis)
    private readonly analysisRepository: Repository<PackageElfAnalysis>,
    @InjectRepository(ArchlinuxPackage)
    private readonly archlinuxPackageRepository: Repository<ArchlinuxPackage>,
    @InjectRepository(Package)
    private readonly packageRepository: Repository<Package>,
    @InjectRepository(Repo)
    private readonly repoRepository: Repository<Repo>,
  ) {}

  async exportSeed(): Promise<PackageElfAnalysis[]> {
    return this.analysisRepository.find({ order: { pkgType: 'ASC', pkgId: 'ASC' } });
  }

  /**
   * Import a JSON seed produced by exportSeed (or by the offline indexer).
   * Entries may be identified by a numeric pkgId (backend-exported seeds) or
   * by pkgname (+ repo for Chaotic); the latter are resolved to the current
   * database's ids (creating package rows when needed).
   */
  async importSeed(seed: unknown[]): Promise<void> {
    if (!seed?.length) return;
    const analyses = await this.importEntries(seed);
    await this.signalScanService.refreshAfterImport(analyses);
    this.logger.log(`Imported ${analyses.length} ELF analyses from seed`);
  }

  /** Stream a newline-delimited JSON seed file, importing in batches. */
  async importSeedFile(path: string): Promise<void> {
    const stream = createReadStream(path, { encoding: 'utf8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    const batch: unknown[] = [];
    const allAnalyses: ImportedAnalysis[] = [];
    let processed = 0;
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      batch.push(JSON.parse(trimmed));
      if (batch.length >= IMPORT_BATCH_SIZE) {
        allAnalyses.push(...(await this.importEntries(batch.splice(0, IMPORT_BATCH_SIZE))));
        processed += IMPORT_BATCH_SIZE;
        this.logger.debug(`Imported ${processed} seed entries so far`, 'SeedTransferService');
      }
    }
    if (batch.length) {
      allAnalyses.push(...(await this.importEntries(batch)));
      processed += batch.length;
    }
    this.logger.log(`Imported ${processed} seed entries; deriving pluginOf...`, 'SeedTransferService');

    await this.signalScanService.refreshAfterImport(allAnalyses);
    this.logger.log(`Imported ${allAnalyses.length} ELF analyses from ${path}`);
  }

  private async importEntries(raw: unknown[]): Promise<ImportedAnalysis[]> {
    const entries = raw.map((entry) => seedEntrySchema.parse(entry));
    const analyses = await this.resolveSeedIdentity(entries);

    const archIds = analyses.filter((a) => a.pkgType === ARCH_PKG_TYPE).map((a) => a.pkgId);
    const chaoticIds = analyses.filter((a) => a.pkgType === CHAOTIC_PKG_TYPE).map((a) => a.pkgId);
    const select = { pkgId: true, version: true };
    const [archRows, chaoticRows] = await Promise.all([
      this.findAnalyses(ARCH_PKG_TYPE, archIds, select),
      this.findAnalyses(CHAOTIC_PKG_TYPE, chaoticIds, select),
    ]);
    const stored = new Set<string>([...archRows, ...chaoticRows].map(analysisKey));

    const changed = analyses.filter((a) => !stored.has(analysisKey(a)));
    if (changed.length > 0) {
      await this.analysisRepository.upsert(changed, ['pkgType', 'pkgId', 'version']);
    }
    return changed;
  }

  private async resolveSeedIdentity(entries: SeedEntry[]): Promise<ImportedAnalysis[]> {
    const resolved: ImportedAnalysis[] = [];

    // Resolve Arch pkgname entries in one query instead of one per entry.
    const archNames = [
      ...new Set(
        entries
          .filter((e) => e.pkgType === ARCH_PKG_TYPE && typeof e.pkgId !== 'number')
          .map((e) => e.pkgname)
          .filter((n): n is string => !!n),
      ),
    ];
    const archById = new Map<string, number>();
    if (archNames.length > 0) {
      const existing = await this.archlinuxPackageRepository.find({ where: { pkgname: In(archNames) } });
      for (const row of existing) archById.set(row.pkgname, row.id);
      const missing = archNames.filter((n) => !archById.has(n));
      if (missing.length > 0) {
        const created = await this.archlinuxPackageRepository.save(
          missing.map((name) => ({ pkgname: name, version: 'unknown' })),
        );
        for (const row of created) archById.set(row.pkgname, row.id);
      }
    }

    for (const entry of entries) {
      let pkgId = entry.pkgId;
      if (typeof pkgId !== 'number') {
        if (typeof entry.pkgname !== 'string' || entry.pkgname.length === 0) {
          throw new Error('Invalid seed entry: expected a numeric pkgId or a pkgname');
        }
        if (entry.pkgType === ARCH_PKG_TYPE) {
          const id = archById.get(entry.pkgname);
          if (id === undefined) {
            throw new Error(`Failed to resolve Arch package ${entry.pkgname}`);
          }
          pkgId = id;
        } else {
          if (typeof entry.repo !== 'string' || entry.repo.length === 0) {
            throw new Error(`Invalid seed entry: Chaotic package ${entry.pkgname} requires a repo name`);
          }
          const repo = await getOrCreateRepo(entry.repo, this.repoRepository);
          const pkg = await getOrCreatePackage(entry.pkgname, this.packageRepository, repo);
          pkgId = pkg.id;
        }
      }
      const { pkgname, repo, ...rest } = entry;
      void pkgname;
      void repo;
      resolved.push({ ...rest, pkgId });
    }
    return resolved;
  }

  private findAnalyses(
    pkgType: PackageElfPkgType,
    ids: number[],
    select: FindOptionsSelect<PackageElfAnalysis>,
  ): Promise<PackageElfAnalysis[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.analysisRepository.find({ where: { pkgType, pkgId: In(ids) }, select });
  }
}

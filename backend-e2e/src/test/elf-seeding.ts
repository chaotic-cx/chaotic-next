import { Builder, Package, Repo } from '@chaotic-next/backend/builder/builder.entity';
import { EntityLookupService } from '@chaotic-next/backend/builder/entity-lookup.service';
import { type PinoLogger } from 'nestjs-pino';
import { ArchlinuxPackage, PackageElfAnalysis } from '@chaotic-next/backend/repo-manager/repo-manager.entity';
import { ARCH_PKG_TYPE } from '@chaotic-next/backend/repo-manager/signal';
import { type SeedEntry, seedEntrySchema } from '@chaotic-next/shared-lib';
import type { DataSource } from 'typeorm';

/**
 * Seeds ELF analyses for e2e fixtures: resolves seed identities (numeric pkgId
 * or pkgname/repo) to database ids, upserts the analyses, and returns the rows
 * so callers can re-derive derived state via SignalScanService.refreshAfterImport.
 */
export async function seedElfAnalyses(dataSource: DataSource, rawEntries: unknown[]): Promise<PackageElfAnalysis[]> {
  const entries: SeedEntry[] = rawEntries.map((entry) => seedEntrySchema.parse(entry));
  const archRepo = dataSource.getRepository(ArchlinuxPackage);
  const packageRepo = dataSource.getRepository(Package);
  const repoRepo = dataSource.getRepository(Repo);
  const analysisRepo = dataSource.getRepository(PackageElfAnalysis);
  const lookup = new EntityLookupService(packageRepo, dataSource.getRepository(Builder), repoRepo, {
    info: () => undefined,
    debug: () => undefined,
  } as unknown as PinoLogger);

  const resolved: PackageElfAnalysis[] = [];
  for (const entry of entries) {
    let pkgId = entry.pkgId;
    if (typeof pkgId !== 'number') {
      if (entry.pkgType === ARCH_PKG_TYPE) {
        let row = await archRepo.findOne({ where: { pkgname: entry.pkgname } });
        row ??= await archRepo.save({ pkgname: entry.pkgname, version: 'unknown' });
        pkgId = row.id;
      } else {
        if (!entry.pkgname || !entry.repo) {
          throw new Error('Seed entry without numeric pkgId needs a pkgname and a repo');
        }

        const repo = await lookup.getOrCreateRepo(entry.repo);
        const pkg = await lookup.getOrCreatePackage(entry.pkgname, repo);
        pkgId = pkg.id;
      }
    }
    const { pkgname, repo, ...analysis } = entry;
    resolved.push({ ...analysis, pkgId } as PackageElfAnalysis);
  }

  await analysisRepo.upsert(resolved, ['pkgType', 'pkgId', 'version']);
  return resolved;
}

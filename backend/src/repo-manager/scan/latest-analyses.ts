import { Package } from '../../builder/builder.entity';
import { TriggerType } from '../../interfaces/repo-manager';
import { type ArchlinuxPackage, type PackageElfAnalysis } from '../repo-manager.entity';
import { latestAnalysisByKey, pkgTypeOf } from '../signal';
import { IsNull, type Repository } from 'typeorm';

export interface ActiveAnalysis {
  pkgname: string;
  analysis: PackageElfAnalysis;
}

export function analysisKey(analysis: Pick<PackageElfAnalysis, 'pkgType' | 'pkgId'>): string {
  return `${analysis.pkgType}:${analysis.pkgId}`;
}

export async function latestAnalysesByPackage(
  repository: Repository<PackageElfAnalysis>,
): Promise<Map<string, PackageElfAnalysis>> {
  const analyses = await repository.find({
    select: { pkgType: true, pkgId: true, version: true, providedSonames: true },
  });
  return latestAnalysisByKey(analyses, analysisKey);
}

/**
 * A package that left the Arch sync DBs or the Chaotic repo is not installable, so its sonames must not count as provided.
 */
export async function latestActiveAnalysesByPackage(
  analysisRepository: Repository<PackageElfAnalysis>,
  archRepository: Repository<ArchlinuxPackage>,
  packageRepository: Repository<Package>,
): Promise<Map<string, ActiveAnalysis>> {
  const [latest, archPkgs, chaoticPkgs] = await Promise.all([
    latestAnalysesByPackage(analysisRepository),
    archRepository.find({ where: { deactivatedAt: IsNull() }, select: { id: true, pkgname: true } }),
    packageRepository.find({ where: { isActive: true }, select: { id: true, pkgname: true } }),
  ]);
  const nameByKey = new Map<string, string>();
  for (const pkg of archPkgs) {
    nameByKey.set(analysisKey({ pkgType: pkgTypeOf(TriggerType.ARCH), pkgId: pkg.id }), pkg.pkgname);
  }

  for (const pkg of chaoticPkgs) {
    nameByKey.set(analysisKey({ pkgType: pkgTypeOf(TriggerType.CHAOTIC), pkgId: pkg.id }), pkg.pkgname);
  }

  const active = new Map<string, ActiveAnalysis>();
  for (const [key, analysis] of latest) {
    const pkgname = nameByKey.get(key);
    if (pkgname !== undefined) {
      active.set(key, { pkgname, analysis });
    }
  }

  return active;
}

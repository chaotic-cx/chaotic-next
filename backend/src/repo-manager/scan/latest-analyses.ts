import { type PackageElfAnalysis } from '../repo-manager.entity';
import { latestAnalysisByKey } from '../signal';
import { type Repository } from 'typeorm';

export async function latestAnalysesByPackage(
  repository: Repository<PackageElfAnalysis>,
): Promise<Map<string, PackageElfAnalysis>> {
  const analyses = await repository.find({
    select: { pkgType: true, pkgId: true, version: true, providedSonames: true },
  });
  return latestAnalysisByKey(analyses, (analysis) => `${analysis.pkgType}:${analysis.pkgId}`);
}

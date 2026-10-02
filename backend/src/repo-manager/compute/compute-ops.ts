import { type RebuildCoverageReport } from '@chaotic-next/shared-lib';
import { type Repository } from 'typeorm';
import { type Package } from '../../builder/builder.entity';
import { type ArchlinuxPackage, type PackageElfAnalysis, type PackageElfPkgType } from '../repo-manager.entity';
import {
  type BrokenFilterEntry,
  type ImportedAnalysis,
  type RecomputeBrokenOptions,
  type ScannedPackage,
  SignalIndex,
} from '../scan/signal-index';
import { type DetectedTriggerDto, TriggerDetector } from '../scan/trigger-detector';
import { type ComputeLogger } from './compute-logger';

export interface ComputeRepositories {
  analyses: Repository<PackageElfAnalysis>;
  archPackages: Repository<ArchlinuxPackage>;
  packages: Repository<Package>;
}

// Arguments and results must be structured-cloneable, because they cross the worker boundary.
export interface ComputeOps {
  recomputeBroken(args: { filter?: BrokenFilterEntry[]; options?: RecomputeBrokenOptions }): Promise<void>;
  refreshAfterScan(args: { scanned: ScannedPackage[] }): Promise<void>;
  refreshAfterImport(args: { analyses: ImportedAnalysis[] }): Promise<void>;
  recomputePluginOfPkgType(args: { pkgType: PackageElfPkgType }): Promise<void>;
  invalidateDirectoryIndex(args: Record<string, never>): Promise<void>;
  detectArchTriggers(args: { repoId: number; changedIds: number[] }): Promise<Map<string, DetectedTriggerDto>>;
  deploymentTriggers(args: { deployedIds: number[]; consumerIds: number[] }): Promise<Map<number, DetectedTriggerDto>>;
  countUncoveredMissedBreaks(args: Record<string, never>): Promise<number>;
  rebuildCoverage(args: Record<string, never>): Promise<RebuildCoverageReport>;
}

export type ComputeOpName = keyof ComputeOps;
export type ComputeArgs<K extends ComputeOpName> = Parameters<ComputeOps[K]>[0];
export type ComputeResult<K extends ComputeOpName> = Awaited<ReturnType<ComputeOps[K]>>;

export function createComputeOps(repos: ComputeRepositories, logger: ComputeLogger): ComputeOps {
  const index = new SignalIndex(repos.analyses, repos.archPackages, repos.packages, logger);
  const detector = new TriggerDetector(repos.analyses, repos.archPackages, repos.packages, logger);
  return {
    recomputeBroken: ({ filter, options }) => index.recomputeBroken(filter, options),
    refreshAfterScan: ({ scanned }) => index.refreshAfterScan(scanned),
    refreshAfterImport: ({ analyses }) => index.refreshAfterImport(analyses),
    recomputePluginOfPkgType: ({ pkgType }) => index.recomputePluginOfPkgType(pkgType),
    invalidateDirectoryIndex: async () => index.invalidateDirectoryIndex(),
    detectArchTriggers: ({ repoId, changedIds }) => detector.detectArchTriggers(repoId, changedIds),
    deploymentTriggers: ({ deployedIds, consumerIds }) => detector.deploymentTriggers(deployedIds, consumerIds),
    countUncoveredMissedBreaks: () => detector.countUncoveredMissedBreaks(),
    rebuildCoverage: () => detector.rebuildCoverage(),
  };
}

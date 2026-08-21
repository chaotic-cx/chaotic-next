import type { DiffScanFinding } from '@chaotic-next/shared-lib';
import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import type { Repository } from 'typeorm';
import type { Package } from '../builder/builder.entity';
import type { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import { addedLines, isCommentLine } from './rules/diff-utils';

const SRCINFO_DEP_PATTERN = /^\s*(depends|makedepends|checkdepends)\s*=\s*(.+)$/i;

export interface SrcinfoDepMatch {
  type: 'depends' | 'makedepends' | 'checkdepends';
  rawValue: string;
  depName: string;
}

export function isSrcinfoFile(path: string): boolean {
  return path === '.SRCINFO' || path.endsWith('/.SRCINFO');
}

export function cleanDepName(raw: string): string {
  const withoutDesc = raw.split(':')[0];
  const withoutVersion = withoutDesc.split(/[<>=]/)[0];
  return withoutVersion.trim();
}

export function parseSrcinfoDepLine(text: string): SrcinfoDepMatch | null {
  if (isCommentLine(text)) return null;
  const match = text.match(SRCINFO_DEP_PATTERN);
  if (!match) return null;

  const type = match[1].toLowerCase() as 'depends' | 'makedepends' | 'checkdepends';
  const rawValue = match[2].trim();
  const depName = cleanDepName(rawValue);

  if (!depName || !/^[a-z0-9@._+-]+$/i.test(depName)) {
    return null;
  }

  return { type, rawValue, depName };
}

export async function isDependencyPresent(
  depName: string,
  archPkgRepo?: Repository<ArchlinuxPackage>,
  packageRepo?: Repository<Package>,
): Promise<boolean> {
  if (!archPkgRepo && !packageRepo) {
    return true;
  }

  if (archPkgRepo) {
    const archDirect = await archPkgRepo.findOne({ where: { pkgname: depName }, select: { id: true } });
    if (archDirect) return true;
  }

  if (packageRepo) {
    const chaoticDirect = await packageRepo.findOne({
      where: { pkgname: depName, isActive: true },
      select: { id: true },
    });
    if (chaoticDirect) return true;
  }

  if (archPkgRepo) {
    try {
      const archProvides = await archPkgRepo
        .createQueryBuilder('arch')
        .where(`arch.metadata->'provides' ? :dep`, { dep: depName })
        .select('arch.id')
        .getOne();
      if (archProvides) return true;
    } catch {
      const allArch = await archPkgRepo.find({ select: { metadata: true } });
      if (allArch.some((a) => a.metadata?.provides?.some((p) => cleanDepName(p) === depName))) {
        return true;
      }
    }
  }

  if (packageRepo) {
    try {
      const chaoticProvides = await packageRepo
        .createQueryBuilder('pkg')
        .where('pkg.isActive = true')
        .andWhere(`pkg.metadata->'provides' ? :dep`, { dep: depName })
        .select('pkg.id')
        .getOne();
      if (chaoticProvides) return true;
    } catch {
      const allChaotic = await packageRepo.find({ where: { isActive: true }, select: { metadata: true } });
      if (allChaotic.some((p) => p.metadata?.provides?.some((pr) => cleanDepName(pr) === depName))) {
        return true;
      }
    }
  }

  return false;
}

export async function scanSrcinfoDependencies(
  change: MergeRequestDiffSchema,
  isDepPresent: (depName: string) => Promise<boolean>,
): Promise<DiffScanFinding[]> {
  if (!isSrcinfoFile(change.new_path) || change.deleted_file) {
    return [];
  }

  const findings: DiffScanFinding[] = [];
  const checkedDeps = new Set<string>();

  for (const line of addedLines(change)) {
    const parsed = parseSrcinfoDepLine(line.text);
    if (!parsed) continue;

    const { depName } = parsed;
    if (checkedDeps.has(depName)) continue;
    checkedDeps.add(depName);

    const exists = await isDepPresent(depName);
    if (!exists) {
      findings.push({
        ruleId: 'CAUR-UNRESOLVED-DEPENDENCY',
        ruleName: 'Unresolved AUR dependency in .SRCINFO',
        severity: 'warning',
        description: `Added dependency '${depName}' in .SRCINFO is not present in official Arch Linux repositories or Chaotic-AUR. Ensure this AUR dependency is packaged and available before building.`,
        file: change.new_path,
        line: line.line,
        match: line.text.trim(),
      });
    }
  }

  return findings;
}

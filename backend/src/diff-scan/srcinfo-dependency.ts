import { type DiffScanFinding } from '@chaotic-next/shared-lib';
import { type MergeRequestDiffSchema } from '@gitbeaker/core';
import { type Repository } from 'typeorm';
import { type Package } from '../builder/builder.entity';
import { type ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import { addedLines, isCommentLine, visibleFileLines } from './rules/diff-utils';

const SRCINFO_DEP_PATTERN = /^\s*(depends|makedepends|checkdepends)\s*=\s*(.+)$/i;
const SRCINFO_PACKAGE_DECLARATION_PATTERN = /^\s*(?:pkgname|provides)\s*=\s*(.+)$/i;
const DEP_NAME_PATTERN = /^[a-z0-9@._+-]+$/i;

export interface SrcinfoDepMatch {
  type: 'depends' | 'makedepends' | 'checkdepends';
  rawValue: string;
  depName: string;
}

/**
 * Fetches the runtime Depends of an AUR package by name, or null when the
 * package does not exist on the AUR. Lets the MR diff scan walk the dependency
 * tree of missing local packages to surface transitive missing deps.
 */
export type AurDependencyFetcher = (packageName: string) => Promise<string[] | null>;

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

  if (!depName || !DEP_NAME_PATTERN.test(depName)) {
    return null;
  }

  return { type, rawValue, depName };
}

/**
 * Repo databases record provides with versions ("libcurl.so=8-64"), so an
 * exact-match query misses every soname. Compare on the version-less part.
 */
export function providesSatisfied(alias: string): string {
  return `
    jsonb_typeof(${alias}.metadata -> 'provides') = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(${alias}.metadata -> 'provides') AS provided
      WHERE split_part(provided, '=', 1) = :dep
    )
  `;
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
        .where(providesSatisfied('arch'))
        .setParameter('dep', depName)
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
        .andWhere(providesSatisfied('pkg'))
        .setParameter('dep', depName)
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

/**
 * Package names the scanned source itself provides: every pkgname and provides
 * entry visible in the diff. Split packages depend on their siblings, which repo
 * lookups cannot resolve before the build lands. Names must match exactly — a
 * "-git" sibling does not satisfy an unsuffixed dependency unless it declares it.
 */
export function selfProvidedDepNames(change: Pick<MergeRequestDiffSchema, 'diff'>): Set<string> {
  const names = new Set<string>();
  for (const text of visibleFileLines(change).values()) {
    if (isCommentLine(text)) continue;
    const match = text.match(SRCINFO_PACKAGE_DECLARATION_PATTERN);
    if (!match) continue;
    const name = cleanDepName(match[1]);
    if (name && DEP_NAME_PATTERN.test(name)) names.add(name);
  }
  return names;
}

export async function scanSrcinfoDependencies(
  change: MergeRequestDiffSchema,
  isDepPresent: (depName: string) => Promise<boolean>,
  fetchAurDependencies?: AurDependencyFetcher,
): Promise<DiffScanFinding[]> {
  if (!isSrcinfoFile(change.new_path) || change.deleted_file) {
    return [];
  }

  const findings: DiffScanFinding[] = [];
  const checkedDeps = new Set<string>();
  const selfProvided = selfProvidedDepNames(change);

  for (const line of addedLines(change)) {
    const parsed = parseSrcinfoDepLine(line.text);
    if (!parsed) continue;

    const { depName } = parsed;
    if (checkedDeps.has(depName)) continue;
    checkedDeps.add(depName);

    if (selfProvided.has(depName)) continue;

    const exists = await isDepPresent(depName);
    if (!exists) {
      findings.push({
        ruleId: 'CAUR-UNRESOLVED-DEPENDENCY',
        ruleName: 'Unresolved AUR dependency in .SRCINFO',
        severity: 'warning',
        description: `${depName} is a missing dependency from .SRCINFO.`,
        file: change.new_path,
        line: line.line,
        match: line.text.trim(),
      });

      if (fetchAurDependencies) {
        const transitive = await findTransitiveMissingDeps(depName, isDepPresent, fetchAurDependencies, checkedDeps);
        for (const missing of transitive) {
          findings.push({
            ruleId: 'CAUR-UNRESOLVED-DEPENDENCY',
            ruleName: 'Transitive AUR dependency in .SRCINFO',
            severity: 'warning',
            description: `${missing.dep} is a missing transitive dependency from ${missing.chain.join(' -> ')}.`,
            file: change.new_path,
            line: line.line,
            match: missing.dep,
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Depth-first walk of an AUR package's runtime dependency tree, returning every
 * dependency that is not present locally. `checkedDeps` accumulates every
 * resolved name (present or not) across direct and transitive scans, so shared
 * subtrees and cycles are expanded once.
 */
async function findTransitiveMissingDeps(
  packageName: string,
  isDepPresent: (depName: string) => Promise<boolean>,
  fetchAurDependencies: AurDependencyFetcher,
  checkedDeps: Set<string>,
): Promise<{ dep: string; chain: string[] }[]> {
  const missing: { dep: string; chain: string[] }[] = [];
  checkedDeps.delete(packageName);

  const walk = async (name: string, chain: string[]): Promise<void> => {
    if (checkedDeps.has(name)) return;
    checkedDeps.add(name);

    const deps = await fetchAurDependencies(name);
    if (!deps) return;

    for (const rawDep of deps) {
      const dep = cleanDepName(rawDep);
      if (!dep || !DEP_NAME_PATTERN.test(dep)) continue;
      if (checkedDeps.has(dep)) continue;

      const present = await isDepPresent(dep);
      if (present) {
        checkedDeps.add(dep);
        continue;
      }

      missing.push({ dep, chain: [...chain, name] });
      await walk(dep, [...chain, name]);
    }
  };

  await walk(packageName, []);
  return missing;
}

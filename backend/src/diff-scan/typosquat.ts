import type { DiffScanFinding } from '@chaotic-next/shared-lib';
import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import type { Repository } from 'typeorm';
import type { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import { parsePkgbuild } from './pkgbuild';

const NAMES_CACHE_TTL_MS = 30 * 60 * 1000;
const SHORT_NAME_MAX_DISTANCE = 1;
const LONG_NAME_MAX_DISTANCE = 2;
const LONG_NAME_MIN_LENGTH = 8;

/** Variant markers that legitimately coexist with an unsuffixed official package. */
const NAME_SUFFIXES = ['-git', '-svn', '-hg', '-bzr', '-bin'];
const NAME_PREFIXES = ['lib32-', 'lib64-'];

export interface TyposquatMatch {
  knownName: string;
  distance: number;
}

interface NamesCache {
  names: Set<string>;
  fetchedAt: number;
}

let namesCache: NamesCache | null = null;

/**
 * Flags PKGBUILDs whose pkgname closely resembles an official Arch package
 * name, a common impersonation trick. Exact names and ordinary variant
 * suffixes/prefixes do not count.
 */
export async function findTyposquatFinding(
  change: MergeRequestDiffSchema,
  archRepo?: Repository<ArchlinuxPackage>,
): Promise<DiffScanFinding | null> {
  const pkgName = parsePkgbuild(change)?.vars.get('pkgname');
  if (!pkgName) return null;

  const knownNames = await loadKnownNames(archRepo);
  const match = closestKnownName(pkgName, knownNames);
  if (!match) return null;

  return {
    ruleId: 'CAUR-TYPOSQUAT-NAME',
    ruleName: 'Possible impersonation of an official package',
    severity: 'warning',
    description:
      `Package name "${pkgName}" closely resembles official package "${match.knownName}" ` +
      `(edit distance ${match.distance}). Impersonating well-known packages is a common ` +
      'malware delivery trick. Make sure that the name difference is intentional.',
    file: change.new_path,
    match: `pkgname=${pkgName}`,
  };
}

async function loadKnownNames(archRepo?: Repository<ArchlinuxPackage>): Promise<Set<string>> {
  if (!archRepo) return new Set();
  if (namesCache && Date.now() - namesCache.fetchedAt < NAMES_CACHE_TTL_MS) return namesCache.names;

  const rows = await archRepo.find({ select: { pkgname: true } });
  const names = new Set(rows.map((row) => row.pkgname));
  namesCache = { names, fetchedAt: Date.now() };
  return names;
}

export function closestKnownName(pkgName: string, knownNames: ReadonlySet<string>): TyposquatMatch | null {
  const normalized = normalizePackageName(pkgName);
  let best: TyposquatMatch | null = null;

  for (const knownName of knownNames) {
    const knownNormalized = normalizePackageName(knownName);
    if (knownNormalized === normalized || knownNormalized.length === 0) continue;

    const maxDistance =
      Math.min(normalized.length, knownNormalized.length) < LONG_NAME_MIN_LENGTH
        ? SHORT_NAME_MAX_DISTANCE
        : LONG_NAME_MAX_DISTANCE;
    const distance = boundedEditDistance(normalized, knownNormalized, maxDistance);
    if (distance === null) continue;

    if (!best || best.distance > distance) {
      best = { knownName, distance };
    }
  }
  return best;
}

export function normalizePackageName(name: string): string {
  let normalized = name.toLowerCase();
  for (const prefix of NAME_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }
  let strippedSuffix = true;
  while (strippedSuffix) {
    strippedSuffix = false;
    for (const suffix of NAME_SUFFIXES) {
      if (normalized.endsWith(suffix)) {
        normalized = normalized.slice(0, -suffix.length);
        strippedSuffix = true;
        break;
      }
    }
  }
  return normalized;
}

/** Levenshtein distance, or null when it abandons rows beyond `maxDistance`. */
function boundedEditDistance(left: string, right: string, maxDistance: number): number | null {
  if (left === right) return null;
  if (Math.abs(left.length - right.length) > maxDistance) return null;

  let previousRow: number[] = [];
  for (let index = 0; index <= right.length; index++) previousRow.push(index);
  for (let i = 1; i <= left.length; i++) {
    const currentRow = [i];
    let rowMinimum = i;
    for (let j = 1; j <= right.length; j++) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      const value = Math.min(previousRow[j] + 1, currentRow[j - 1] + 1, previousRow[j - 1] + substitutionCost);
      currentRow.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maxDistance) return null;
    previousRow = currentRow;
  }
  const distance = previousRow[right.length];
  return distance <= maxDistance ? distance : null;
}

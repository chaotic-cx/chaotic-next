import { extractArray } from '../repo-manager/pkgbuild-classifier';
import { remoteDataLoader, type RuleLoadResult } from './rules/rule';
import { type DiffScanFinding } from '@chaotic-next/shared-lib';

export const EOL_RULE_ID = 'CAUR-EOL-DEP';
export const EOL_RULE_NAME = 'EOL dependency';

const EOL_API_BASE = 'https://endoflife.date/api/v1/products';

/**
 * Maps dependency names to endoflife.date product slugs. Only products with a
 * meaningful end-of-life schedule are listed.
 */
const PRODUCT_BY_DEP: readonly (readonly [RegExp, string])[] = [
  [/^python\d*$/, 'python'],
  [/^php\d*$/, 'php'],
  [/^nodejs$/, 'nodejs'],
  [/^node$/, 'nodejs'],
  [/^postgres(?:ql|gres)?(?:-libs|-docs|-clients)?$/, 'postgresql'],
  [/^libpq$/, 'postgresql'],
  [/^openssl/, 'openssl'],
  [/^ruby$/, 'ruby'],
  [/^mariadb(?:-libs|-clients)?$/, 'mariadb'],
  [/^mysql$/, 'mysql'],
  [/^erlang/, 'erlang'],
  [/^go$/, 'go'],
  [/^linux(-lts|-zen|-hardened|-rt)?$/, 'linux'],
  [/^electron\d*$/, 'electron'],
  [/^django$/, 'django'],
  [/^redis$/, 'redis'],
  [/^mongodb$/, 'mongodb'],
  [/^elasticsearch$/, 'elasticsearch'],
  [/^perl$/, 'perl'],
  [/^dotnet/, 'dotnet'],
  [/^(?:java-runtime|java-environment|jdk\d*(-openjdk)?|openjdk\d*|jre\d*(-openjdk)?)$/, 'java'],
];

interface Cycle {
  cycle: string;
  eol: string | boolean;
}

interface DependencyConstraint {
  clean: string;
  name: string;
  op: string | null;
  version: string | null;
}

/** Splits a dependency token into its name, comparison operator, and version (if any). */
export function parseDependencyConstraint(dep: string): DependencyConstraint {
  const clean = dep.replace(/^['"]+|['"]+$/g, '').trim();
  const match = clean.match(/^([A-Za-z0-9_.@+-]+?)\s*([<>=]+)\s*(.+)$/);
  if (match?.[1] === undefined || match?.[2] === undefined || match?.[3] === undefined) {
    return { clean, name: clean, op: null, version: null };
  }
  return { clean, name: match[1], op: match[2], version: match[3].trim() };
}

/**
 * Some AUR packages encode the product version in the dependency name
 * (`electron37`, `php81`, `python310`), which pins one exact major.
 */
const NAME_VERSION_RULES: readonly (readonly [RegExp, string, (match: RegExpMatchArray) => string])[] = [
  [/^electron(\d+)$/, 'electron', (match) => match[1]],
  [/^php(\d)(\d+)$/, 'php', (match) => `${match[1]}.${match[2]}`],
  [/^python(\d)(\d+)$/, 'python', (match) => `${match[1]}.${match[2]}`],
];

function nameEncodedVersion(name: string): { product: string; version: string } | null {
  for (const [pattern, product, buildVersion] of NAME_VERSION_RULES) {
    const match = name.match(pattern);
    if (match) return { product, version: buildVersion(match) };
  }
  return null;
}

export function productForDependency(name: string): string | null {
  const lower = name.toLowerCase();
  return PRODUCT_BY_DEP.find(([pattern]) => pattern.test(lower))?.[1] ?? null;
}

/** A version matches a cycle when the cycle number components are a prefix of the version components. */
export function matchesCycle(version: string, cycle: string): boolean {
  const versionParts = version.split(/[.+~_-]/).filter((part) => part.length > 0);
  const cycleParts = cycle.split('.');
  return cycleParts.every((cyclePart, index) => {
    const versionPart = versionParts[index];
    return versionPart !== undefined && Number(versionPart) === Number(cyclePart);
  });
}

function findMatchingCycle(version: string, cycles: Cycle[]): Cycle | null {
  const matches = cycles.filter((cycle) => matchesCycle(version, cycle.cycle));
  matches.sort((a, b) => b.cycle.split('.').length - a.cycle.split('.').length);
  return matches[0] ?? null;
}

function isEndOfLife(eol: Cycle['eol']): eol is string {
  if (typeof eol !== 'string') return false;
  const date = new Date(eol).getTime();
  return !Number.isNaN(date) && date < Date.now();
}

/**
 * Lazily built feed loaders, one per endoflife.date product. Each loader
 * memoizes the downloaded payload in the process and persists it under a
 * stable cache key, so an API outage falls back to the last stored payload.
 */
const productLoaders = new Map<string, () => Promise<RuleLoadResult<Cycle[]>>>();

function productLoader(product: string): () => Promise<RuleLoadResult<Cycle[]>> {
  let loader = productLoaders.get(product);
  if (loader === undefined) {
    loader = remoteDataLoader<Cycle[]>({
      url: `${EOL_API_BASE}/${encodeURIComponent(product)}`,
      transform: (raw) => {
        const data: unknown = JSON.parse(raw);
        const releases = (data as { result?: { releases?: unknown } }).result?.releases;
        if (!Array.isArray(releases)) return [];
        return releases
          .map((release) => {
            const record = release as { name?: unknown; isEol?: unknown; eolFrom?: unknown };
            if (typeof record.name !== 'string') return null;
            const eol = record.isEol === true ? (typeof record.eolFrom === 'string' ? record.eolFrom : true) : false;
            return { cycle: record.name, eol } satisfies Cycle;
          })
          .filter((cycle): cycle is Cycle => cycle !== null);
      },
    });
    productLoaders.set(product, loader);
  }
  return loader;
}

async function fetchProductCycles(product: string): Promise<Cycle[]> {
  try {
    return (await productLoader(product)()).data;
  } catch {
    // Network down and no persisted payload: report nothing instead of failing the scan.
    return [];
  }
}

/**
 * Checks the dependency arrays of a PKGBUILD against endoflife.date. Every
 * dependency that pins a version of a known product and matches an
 * end-of-life cycle produces one warning finding.
 */
export async function checkEolDependencies(pkgbuildText: string): Promise<DiffScanFinding[]> {
  const dependencies = ['depends', 'makedepends', 'checkdepends', 'depends_x86_64'].flatMap(
    (array) => extractArray(pkgbuildText, array) ?? [],
  );
  const findings: DiffScanFinding[] = [];
  for (const dependency of dependencies) {
    if (dependency.includes('$')) continue;
    const constraint = parseDependencyConstraint(dependency);
    // A name-encoded major (`electron39`) pins the product version whatever
    // the operators around it say. A bare `>=` floor is not the version the
    // package builds against, so it is never an EOL candidate.
    const encoded = nameEncodedVersion(constraint.name);
    let name = constraint.name;
    let version: string | null = null;
    if (encoded !== null) {
      name = encoded.product;
      version = encoded.version;
    } else if (constraint.op === '=' && constraint.version !== null) {
      version = constraint.version;
    }
    if (version === null) continue;
    const product = productForDependency(name);
    if (product === null) continue;
    const cycles = await fetchProductCycles(product);
    const cycle = findMatchingCycle(version, cycles);
    if (cycle === null || !isEndOfLife(cycle.eol)) continue;
    findings.push({
      ruleId: EOL_RULE_ID,
      ruleName: EOL_RULE_NAME,
      severity: 'warning',
      description: `The dependency ${product} ${version} reached end of life on ${cycle.eol}. Update to a supported release.`,
      file: 'PKGBUILD',
      match: constraint.clean,
      informational: true,
      countsTowardMalwareScan: false,
    });
  }
  return findings;
}

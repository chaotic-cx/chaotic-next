import { type PackageElfPkgType } from '../repo-manager.entity';
import { RUNTIME_INTERPRETER_PREFIX, sonameBasename } from './parse';

/**
 * A package's ELF signature as needed to build a dependency graph. Identifies a
 * package across both Arch and Chaotic namespaces, and lists the sonames it
 * ships (providedSonames) and links (neededSonames). pkgname is carried so
 * downstream consumers can render edges without a second lookup.
 */
export interface DependencyNode {
  pkgType: PackageElfPkgType;
  pkgId: number;
  pkgname: string;
  providedSonames: string[];
  neededSonames: string[];
}

/**
 * A resolved dependency edge: the consumer links a soname that the provider
 * ships. Sonames provided by the base system (see BASE_SYSTEM_SONAMES) are
 * skipped so edges point at real packages, not glibc.
 */
export interface DependencyEdge {
  consumer: DependencyNode;
  provider: DependencyNode;
  soname: string;
}

/**
 * Sonames that the base Arch system always provides (glibc, gcc-libs, zlib, ...).
 * A package linking one of these is never "broken" just because the provider
 * hasn't been indexed yet — the allowlist guards against false positives before
 * the full mirror has been scanned.
 */
export const BASE_SYSTEM_SONAMES: ReadonlySet<string> = new Set([
  'ld-linux-x86-64.so.2',
  'ld-linux-aarch64.so.1',
  'ld-linux.so.2',
  'libc.so.6',
  'libm.so.6',
  'libmvec.so.1',
  'libdl.so.2',
  'libpthread.so.0',
  'librt.so.1',
  'libresolv.so.2',
  'libutil.so.1',
  'libnsl.so.1',
  'libcrypt.so.1',
  'libanl.so.1',
  'libBrokenLocale.so.1',
  'libgcc_s.so.1',
  'libstdc++.so.6',
  'libz.so.1',
  'libzstd.so.1',
  'liblzma.so.5',
  'libbz2.so.1.0',
  'liblz4.so.1',
]);

export function buildDependencyGraph(nodes: DependencyNode[]): DependencyEdge[] {
  const bySoname = new Map<string, DependencyNode[]>();
  for (const node of nodes) {
    for (const soname of node.providedSonames) {
      const providers = bySoname.get(soname) ?? [];
      providers.push(node);
      bySoname.set(soname, providers);
    }
  }

  const edges: DependencyEdge[] = [];
  for (const consumer of nodes) {
    for (const soname of consumer.neededSonames) {
      if (BASE_SYSTEM_SONAMES.has(soname)) continue;
      for (const provider of bySoname.get(soname) ?? []) {
        if (provider === consumer) continue;
        edges.push({ consumer, provider, soname });
      }
    }
  }
  return edges;
}

/**
 * Versioned runtime directories whose interpreter version must match the repo's current one.
 */
export type RuntimeName = 'python' | 'perl' | 'ruby' | 'ghc';

/**
 * Minimum number of distinct provided sonames before missing-soname detection
 * is trusted. Below this the index is too sparse (no full mirror scan yet) and
 * nearly every package would look broken, so only runtime-dir detection runs.
 */
export const MIN_PROVIDED_SONAMES = 100;

export interface BrokenDependency {
  kind: 'soname' | 'runtime' | 'version';
  /** The needed soname nobody in the index provides (kind = soname). */
  soname?: string;
  /** Version nodes the consumer needs that the provider no longer defines (kind = version). */
  versionNodes?: string[];
  /** The runtime whose version dir no longer matches (kind = runtime). */
  runtime?: RuntimeName;
  /** Current repo version of the runtime, e.g. "3.13" for python. */
  currentVersion?: string;
  /** Version encoded in the shipped path, e.g. "3.12". */
  pathVersion?: string;
  /** An example shipped path carrying the stale runtime dir. */
  path?: string;
}

function versionKey(version: string, segments: number): string {
  return version.split('.').slice(0, segments).join('.');
}

function staleRuntimeDependencies(
  files: string[],
  runtimes: Partial<Record<RuntimeName, string | null>>,
  selfProvidedSonames: ReadonlySet<string> = new Set(),
): BrokenDependency[] {
  const deps: BrokenDependency[] = [];
  const seen = new Set<string>();

  const check = (runtime: RuntimeName, segments: number, extract: (path: string) => string | null): void => {
    const current = runtimes[runtime];
    if (!current) return;
    const prefix = RUNTIME_INTERPRETER_PREFIX[runtime];
    if (prefix) {
      for (const soname of selfProvidedSonames) {
        if (soname.startsWith(prefix)) return;
      }
    }
    const expected = versionKey(current, segments);
    for (const file of files) {
      const found = extract(file);
      if (found) {
        const foundKey = versionKey(found, segments);
        if (foundKey !== expected) {
          const key = `${runtime}:${foundKey}`;
          if (!seen.has(key)) {
            seen.add(key);
            deps.push({
              kind: 'runtime',
              runtime,
              currentVersion: expected,
              pathVersion: foundKey,
              path: file,
            });
          }
        }
      }
    }
  };

  const usrLib = '(?:^|/)usr/lib/';
  check('python', 2, (path) => new RegExp(`${usrLib}python(3\\.\\d+(?:\\.\\d+)?)(?:/|$)`).exec(path)?.[1] ?? null);
  check(
    'perl',
    2,
    (path) => new RegExp(`${usrLib}perl5/(?:(?:site|vendor|core)_perl/)?(5\\.\\d+)(?:/|$)`).exec(path)?.[1] ?? null,
  );
  check(
    'ruby',
    2,
    (path) => new RegExp(`${usrLib}ruby/(?:(?:gems|site_ruby)/)?(\\d+\\.\\d+(?:\\.\\d+)?)/`).exec(path)?.[1] ?? null,
  );
  check('ghc', 3, (path) => new RegExp(`${usrLib}ghc-(\\d+\\.\\d+\\.\\d+)(?:/|$)`).exec(path)?.[1] ?? null);

  return deps;
}

function sonameVersionPrefix(soname: string): string {
  const idx = soname.indexOf('.so.');
  return idx === -1 ? soname : soname.slice(0, idx + 3);
}

function unversionedResolvable(soname: string, providedSonames: ReadonlySet<string>): boolean {
  if (!soname.endsWith('.so')) return false;
  const prefix = sonameVersionPrefix(soname);
  for (const provided of providedSonames) {
    if (provided === soname || provided.startsWith(`${prefix}.`)) return true;
  }
  return false;
}

function isSonameSatisfied(
  soname: string,
  basename: string,
  shipped: ReadonlySet<string>,
  provided: ReadonlySet<string>,
  base: ReadonlySet<string>,
): boolean {
  return shipped.has(basename) || provided.has(soname) || provided.has(basename) || base.has(soname);
}

export function findBrokenDependencies(opts: {
  neededSonames: string[];
  files: string[];
  providedSonames: ReadonlySet<string>;
  baseSonames?: Iterable<string>;
  runtimes?: Partial<Record<RuntimeName, string | null>>;
  /** When false, only stale-runtime-dir detection runs (sparse index). Default true. */
  checkSonames?: boolean;
  /** Sonames the package itself ships; a runtime's own lib exempts its version dirs. */
  selfProvidedSonames?: Iterable<string>;
}): BrokenDependency[] {
  const deps: BrokenDependency[] = [];
  const base = new Set(opts.baseSonames ?? BASE_SYSTEM_SONAMES);
  // A package never breaks itself: a needed soname matching one of its own
  // shipped files (e.g. LibreOffice's bundled libmergedlo.so resolved via
  // rpath) is not a missing dependency.
  const shipped = new Set(opts.files.map(sonameBasename));

  if (opts.checkSonames !== false) {
    for (const soname of opts.neededSonames ?? []) {
      const basename = sonameBasename(soname);
      if (isSonameSatisfied(soname, basename, shipped, opts.providedSonames, base)) continue;
      if (unversionedResolvable(soname, opts.providedSonames)) continue;
      deps.push({ kind: 'soname', soname });
    }
  }

  deps.push(
    ...staleRuntimeDependencies(
      opts.files ?? [],
      {
        python: opts.runtimes?.python ?? null,
        perl: opts.runtimes?.perl ?? null,
        ruby: opts.runtimes?.ruby ?? null,
        ghc: opts.runtimes?.ghc ?? null,
      },
      new Set(opts.selfProvidedSonames),
    ),
  );

  return deps;
}

export function formatBrokenDependency(dep: BrokenDependency): string {
  if (dep.kind === 'soname') return `missing soname ${dep.soname}`;
  if (dep.kind === 'version') return `missing version ${dep.versionNodes?.join(', ')} from ${dep.soname}`;
  return `${dep.runtime} ${dep.pathVersion} shipped but ${dep.runtime} is ${dep.currentVersion} (${dep.path})`;
}

const PRIVATE_VERSION_NODE = /private/i;

/**
 * Version nodes a consumer requires from a soname that the provider no longer
 * defines. A soname can stay identical while its version nodes are re-versioned
 * (onnxruntime `VERS_1.28.0` -> `VERS_1.29.0`); the consumer then fails to load
 * even though the soname and its symbols are unchanged.
 */
export function findVersionNodeBreaks(opts: {
  neededVersionNodes: Record<string, string[]>;
  providerVersionNodes: Record<string, string[]>;
}): { soname: string; versionNodes: string[] }[] {
  const breaks: { soname: string; versionNodes: string[] }[] = [];
  for (const [soname, needed] of Object.entries(opts.neededVersionNodes ?? {})) {
    const provided = new Set(opts.providerVersionNodes?.[soname] ?? []);
    const missing = [...new Set(needed)].filter((node) => !provided.has(node) && !PRIVATE_VERSION_NODE.test(node));
    if (missing.length > 0) breaks.push({ soname, versionNodes: missing });
  }
  return breaks;
}

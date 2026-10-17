import {
  BROKEN_FIXABILITIES,
  type BrokenFixability,
  brokenFixabilitySchema,
  type BrokenIssue,
} from '@chaotic-next/shared-lib';
import { type BrokenDependency, formatBrokenDependency, sonameVersionPrefix } from './graph';
import { HASKELL_SONAME_PREFIX, haskellPackageName } from './parse';

const FIXABILITY = brokenFixabilitySchema.enum;

export interface FixabilityContext {
  /** Stems of all provided sonames, see sonameStems. */
  sonameStems: ReadonlySet<string>;
  /** Broken reasons at the first scan of the consumer version. */
  reasonsAsBuilt: ReadonlySet<string>;
  isSourceCompiled: boolean;
}

/**
 * A soname without its version: `libjsoncpp.so.27` becomes `libjsoncpp.so`.
 * A Haskell soname keeps its version and hash in the name, so
 * `libHSsyb-0.7.4-6GzGX-ghc9.6.7.so` becomes `libHSsyb`.
 */
function successorStem(soname: string): string {
  const haskell = haskellPackageName(soname);
  return haskell ? `${HASKELL_SONAME_PREFIX}${haskell}` : sonameVersionPrefix(soname);
}

/**
 * The stems of the provided sonames, see successorStem.
 */
export function sonameStems(providedSonames: Iterable<string>): Set<string> {
  const stems = new Set<string>();
  for (const soname of providedSonames) {
    stems.add(successorStem(soname));
  }

  return stems;
}

/**
 * Whether a rebuild has something to link against. A missing soname needs a
 * provider of another version of the same library (`libjsoncpp.so.27` for
 * `libjsoncpp.so.26`). Stale runtime directories and re-versioned symbols
 * always resolve against the current provider.
 */
export function hasSuccessor(dep: BrokenDependency, stems: ReadonlySet<string>): boolean {
  if (dep.kind !== 'soname' || !dep.soname) return true;

  return stems.has(successorStem(dep.soname));
}

/**
 * A reason that was already present at the first scan survived a build, so a
 * rebuild does not fix it. Without a rebuild, a source package needs a
 * PKGBUILD or upstream change, and a prebuilt package has no fix.
 */
export function classifyBrokenDependency(dep: BrokenDependency, ctx: FixabilityContext): BrokenIssue {
  const reason = formatBrokenDependency(dep);
  const rebuildFixes = hasSuccessor(dep, ctx.sonameStems) && !ctx.reasonsAsBuilt.has(reason);
  return { reason, fixability: fixabilityOf(rebuildFixes, ctx.isSourceCompiled) };
}

function fixabilityOf(rebuildFixes: boolean, isSourceCompiled: boolean): BrokenFixability {
  if (rebuildFixes) return FIXABILITY.rebuild;

  return isSourceCompiled ? FIXABILITY.pkgbuildChange : FIXABILITY.noFix;
}

/**
 * The fixability of a package is the one of its worst reason.
 */
export function worstFixability(issues: BrokenIssue[]): BrokenFixability {
  let worst: BrokenFixability = FIXABILITY.rebuild;
  for (const { fixability } of issues) {
    if (BROKEN_FIXABILITIES.indexOf(fixability) > BROKEN_FIXABILITIES.indexOf(worst)) {
      worst = fixability;
    }
  }

  return worst;
}

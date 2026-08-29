/**
 * Known build failure patterns, ordered from most specific to least specific.
 * `scanBuildLogForCause` returns the first rule that matches, so the reported
 * cause is the root problem and not the generic "A failure occurred in build()"
 * tail that almost every failed log ends with.
 *
 * A rule that carries the `silent` tag must not trigger a notification:
 * those failures resolve themselves (for example a newly introduced checksum
 * problem that a maintainer fixes on the package source).
 * A rule that carries the `transient` tag must not trigger a notification
 * either: those failures usually pass on the next retry.
 */

export const BUILD_FAILURE_TAGS = [
  'dependency',
  'compile',
  'link',
  'package',
  'check',
  'prepare',
  'toolchain',
  'download',
  'network',
  'checksum',
  'metadata',
  'interfere',
  'silent',
  'transient',
] as const;

export type BuildFailureTag = (typeof BUILD_FAILURE_TAGS)[number];

export interface BuildFailureRule {
  /** Stable identifier used for de-duplication and logging. */
  id: string;
  /** Short human-readable cause, shown in notifications. */
  label: string;
  /** Detection pattern, applied to the whole log. */
  regex: RegExp;
  /** Tags describing the failure; `silent` and `transient` suppress notifications. */
  tags: readonly BuildFailureTag[];
  /** Number of preceding log lines to include in the snippet. */
  snippetContextLines?: number;
}

export const BUILD_FAILURE_RULES: readonly BuildFailureRule[] = [
  {
    id: 'missing-dependency',
    label: 'Missing dependency',
    regex: /error: target not found: (.+)/,
    tags: ['dependency'],
  },
  {
    id: 'missing-python-module',
    label: 'Missing Python module',
    regex: /(?:ModuleNotFoundError|No module named) ['"]?([\w.-]+)/,
    tags: ['dependency'],
  },
  {
    id: 'dependency-conflict',
    label: 'Conflicting dependencies',
    regex: /error: (?:unresolvable package conflicts detected|failed to prepare transaction \([^)]*\))/,
    tags: ['dependency'],
  },
  {
    id: 'checksum-mismatch',
    label: 'Checksum mismatch',
    regex: /One or more files did not pass the validity check!/,
    tags: ['checksum'],
  },
  {
    id: 'download-failed',
    label: 'Download failed',
    regex: /Failure while downloading (.+)/,
    tags: ['download'],
  },
  {
    id: 'download-http-error',
    label: 'Download HTTP error',
    regex: /The requested URL returned error: (\d+)/,
    tags: ['download'],
  },
  {
    id: 'network-connect-error',
    label: 'Network connection error',
    regex: /Could not resolve host|Connection timed out|Failed to connect to|Temporary failure in name resolution/,
    tags: ['network', 'transient'],
  },
  {
    id: 'checkout-missing-pkgbuild',
    label: 'Empty build checkout',
    regex: /\/home\/builder\/build\/\S*PKGBUILD: No such file or directory/,
    tags: ['interfere', 'transient'],
  },
  {
    id: 'interfere-prepare-failed',
    label: 'Interfere prepare failed',
    regex: /\/home\/builder\/build\/\/prepare: line \d+:/,
    tags: ['interfere'],
  },
  {
    id: 'dotnet-sdk-missing',
    label: 'Missing .NET SDK',
    regex:
      /It was not possible to find any installed \.NET SDK|error NETSDK1045|NETSDK1005|The specified framework '[\w.]+', version '[\d.]+' was not found/,
    tags: ['toolchain'],
  },
  {
    id: 'npm-engine-mismatch',
    label: 'npm engine mismatch',
    regex: /EBAD(?:DEV)?ENGINE/,
    tags: ['toolchain'],
  },
  {
    id: 'cmake-make-program-missing',
    label: 'Missing CMake build program',
    regex: /CMAKE_MAKE_PROGRAM is not set/,
    tags: ['toolchain'],
  },
  {
    id: 'cmake-error',
    label: 'CMake configuration error',
    regex:
      /CMake Error at CMakeLists\.txt:\d+ \(|CMake Generate step failed\.|Configuring incomplete, errors occurred!|No SOURCES given to target:/,
    tags: ['compile'],
  },
  {
    id: 'linker-error',
    label: 'Linker error',
    regex: /collect2: error: ld returned 1 exit status/,
    tags: ['link', 'compile'],
  },
  {
    id: 'compiler-fatal-error',
    label: 'Compiler error',
    regex: /fatal error: (.+)/,
    tags: ['compile'],
  },
  {
    id: 'cargo-error',
    label: 'Rust build error',
    regex: /error: could not compile `([^`]+)`/,
    tags: ['compile'],
  },
  {
    id: 'make-error',
    label: 'Make error',
    regex: /make(?:\[[\d.]+\])?: \*\*\* (?:\[[^\]]+\] )?(.+)/,
    tags: ['compile'],
  },
  {
    id: 'package-file-missing',
    label: 'Packaging file missing',
    regex: /install: cannot stat ['"]([^'"]+)['"]|cd: ([^:]+): No such file or directory/,
    tags: ['package'],
  },
  {
    id: 'stale-package-artifact',
    label: 'Stale package artifact',
    regex: /\.pkg\.tar\.zst already exists; not overwritten/,
    tags: ['package'],
  },
  {
    id: 'package-write-denied',
    label: 'Cannot write outside staging dir',
    regex: /cp: cannot create regular file '[^']+': Permission denied/,
    tags: ['package'],
  },
  {
    id: 'pkgver-invalid',
    label: 'Invalid pkgver',
    regex: /pkgver in provides is not allowed to be empty/,
    tags: ['metadata'],
  },
  {
    id: 'pkgver-empty',
    label: 'Empty pkgver',
    regex: /==> ERROR: pkgver is not allowed to be empty\./,
    tags: ['metadata'],
  },
  {
    id: 'build-makepkg-failure',
    label: 'Build function failed',
    regex: /==> ERROR: A failure occurred in build\(\)\./,
    tags: ['compile'],
    snippetContextLines: 1,
  },
  {
    id: 'check-makepkg-failure',
    label: 'Check function failed',
    regex: /==> ERROR: A failure occurred in check\(\)\./,
    tags: ['check'],
    snippetContextLines: 1,
  },
  {
    id: 'package-makepkg-failure',
    label: 'Package function failed',
    regex: /==> ERROR: A failure occurred in package\(\)\./,
    tags: ['package'],
    snippetContextLines: 1,
  },
  {
    id: 'prepare-makepkg-failure',
    label: 'Prepare function failed',
    regex: /==> ERROR: A failure occurred in prepare\(\)\./,
    tags: ['prepare'],
    snippetContextLines: 1,
  },
  {
    id: 'pkgver-makepkg-failure',
    label: 'pkgver function failed',
    regex: /==> ERROR: A failure occurred in pkgver\(\)\./,
    tags: ['metadata'],
    snippetContextLines: 1,
  },
];

export interface BuildFailureScan {
  id: string;
  label: string;
  tags: readonly BuildFailureTag[];
  snippet: string;
  /** Short detail from the first capture group of the rule, when it has one. */
  detail?: string;
}

export function isNotifiable(scan: BuildFailureScan): boolean {
  const tags = new Set(scan.tags);
  return !tags.has('silent') && !tags.has('transient');
}

const MAX_SNIPPET_LENGTH = 200;
const MAX_DETAIL_LENGTH = 120;

// ANSI color codes plus the OSC sequences (e.g. `\x1B]3008;...\x07`) that
// hyperlinks render as in the raw log.
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_PATTERN = /\x1B(?:\[[0-9;]*[a-zA-Z]|][^\x07]*\x07)/g;

export function stripAnsi(logText: string): string {
  return logText.replace(ANSI_ESCAPE_PATTERN, '');
}

function snippetFor(cleanLog: string, rule: BuildFailureRule, match: RegExpMatchArray): string {
  const matchIndex = match.index ?? 0;
  const lineStart = cleanLog.lastIndexOf('\n', matchIndex - 1) + 1;
  const lineEnd = cleanLog.indexOf('\n', matchIndex);
  const matchedLine = cleanLog.slice(lineStart, lineEnd === -1 ? cleanLog.length : lineEnd).trim();
  const contextLines = rule.snippetContextLines ?? 0;
  const lines = matchedLine ? [matchedLine] : [];
  if (contextLines > 0) {
    const previous = cleanLog.slice(0, lineStart).trimEnd().split('\n');
    lines.unshift(...previous.slice(-contextLines));
  }
  const snippet = lines.join(' | ').trim();
  return snippet.length > MAX_SNIPPET_LENGTH ? `${snippet.slice(0, MAX_SNIPPET_LENGTH - 1)}…` : snippet;
}

/** Rules with alternations capture in different groups; use the first group that matched. */
function detailFor(match: RegExpMatchArray): string | undefined {
  const captured = match
    .slice(1)
    .find((group) => group !== undefined)
    ?.trim();
  if (!captured) return undefined;
  return captured.length > MAX_DETAIL_LENGTH ? `${captured.slice(0, MAX_DETAIL_LENGTH - 1)}…` : captured;
}

/**
 * Scans a raw build log for a known failure cause. Returns the first (most
 * specific) matching rule, or null when the log does not match any pattern.
 */
export function scanBuildLogForCause(logText: string): BuildFailureScan | null {
  const cleanLog = stripAnsi(logText);
  for (const rule of BUILD_FAILURE_RULES) {
    const match = rule.regex.exec(cleanLog);
    if (match) {
      return {
        id: rule.id,
        label: rule.label,
        tags: rule.tags,
        snippet: snippetFor(cleanLog, rule, match),
        detail: detailFor(match),
      };
    }
  }
  return null;
}

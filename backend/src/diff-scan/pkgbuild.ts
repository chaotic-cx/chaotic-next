import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import { isInScope, type RuleScope, visibleFileLines } from './rules/diff-utils';

const PKGBUILD_SCOPE: RuleScope[] = ['pkgbuild'];
const REPUTABLE_HOSTS = [
  'apache.org',
  'archlinux.org',
  'bitbucket.org',
  'codeberg.org',
  'cpan.org',
  'crates.io',
  'debian.org',
  'freedesktop.org',
  'gitlab.com',
  'github.com',
  'githubusercontent.com',
  'gnu.org',
  'gnome.org',
  'googlesource.com',
  'hackage.haskell.org',
  'kernel.org',
  'metacpan.org',
  'mozilla.org',
  'pypi.org',
  'files.pythonhosted.org',
  'registry.npmjs.org',
  'registry.yarnpkg.com',
  'rubygems.org',
  'sourceforge.net',
];

const VCS_SOURCE = /(?:^|\s|::)(?:git|svn|hg|bzr)\+[A-Za-z]/;
const GIT_URL = /\.git(?:[?#].*)?$/i;

const SCALAR_ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(["']?)([^"'()\s]+)\2/;
/** The `: ${NAME:=default}` idiom packages use for user-overridable build options. */
export const DEFAULT_VALUE_ASSIGNMENT = /^\s*:\s*"?\$\{([A-Za-z_][A-Za-z0-9_]*):?=([^}]*)\}"?/;
const ARRAY_ASSIGNMENT_START = /^\s*([A-Za-z_][A-Za-z0-9_]*)=\s*\((.*)$/;
export const SHELL_BLOCK_START = /^\s*(?:if|for|while|until|case)\b/;
export const SHELL_BLOCK_END = /^\s*(?:fi|done|esac)\b/;

/** Matches `name() {`, `name() (` and brace-less `name()` definitions; array opens like `source=(` stay excluded.
 * Split-package function names may contain dots, plus and minus signs. */
export const FUNCTION_DEFINITION = /^[A-Za-z_][A-Za-z0-9_.+-]*\s*\((?:\)|\s*[{)])/;
export const FUNCTION_BODY_END = /^[})]/;

/**
 * makepkg splits a source entry at the first `::` that is directly followed by
 * a URI scheme, so `filename::https://…` renames the download while the `::`
 * inside bash substring expansions like `${commit::7}` stays untouched.
 */
const FILENAME_URL_SEPARATOR = /^(.*?)::(?=[A-Za-z][A-Za-z0-9+.-]*:\/\/)/;

export function isVcsSource(raw: string): boolean {
  return VCS_SOURCE.test(raw) || GIT_URL.test(raw);
}
export interface SourceEntry {
  raw: string;
  /** The download URL, split off a makepkg `filename::url` prefix when present. */
  url: string;
  /** Optional rename target from the `filename::url` syntax. */
  fileName: string | null;
  host: string | null;
  isVcs: boolean;
  /** Line number of the source entry in the PKGBUILD, when it could be located. */
  line?: number;
}

export interface ParsedPkgbuild {
  text: string;
  entries: SourceEntry[];
  urlHost: string | null;
  vars: ReadonlyMap<string, string>;
}

export function extractArray(pkbuildText: string, name: string): string[] | null {
  const match = pkbuildText.match(new RegExp(`(?:^|\\s)${name}=\\(([^)]*)\\)`, 'm'));
  return match ? match[1].split(/\s+/).filter((entry) => entry.length > 0) : null;
}

export function parseSourceEntry(resolved: string): SourceEntry {
  // Quoting never survives makepkg's own expansion, so interior quote pairs
  // around a `filename::url` rename ("$file"::"$url") are removed as well.
  const stripped = resolved.replace(/["']/g, '');
  const separator = FILENAME_URL_SEPARATOR.exec(stripped);
  const fileName = separator?.[1] ?? null;
  const url = separator === null ? stripped : stripped.slice(separator[0].length);
  return {
    raw: stripped,
    url,
    fileName: fileName === '' ? null : fileName,
    host: hostOf(url),
    isVcs: isVcsSource(url),
  };
}

export function hostOf(url: string): string | null {
  if (!/^[a-z+]+:\/\//i.test(url)) return null;
  try {
    return new URL(url.replace(/^[a-z]+\+/i, '')).host;
  } catch {
    return null;
  }
}

export function isReputable(host: string): boolean {
  return REPUTABLE_HOSTS.some((reputable) => host === reputable || host.endsWith(`.${reputable}`));
}

function extractUrlHost(pkbuildText: string): string | null {
  const match = pkbuildText.match(/(?:^|\s)url=(?:"([^"\n]+)"|'([^'\n]+)'|([^\s()#]+))/m);
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value ? hostOf(value) : null;
}

export function extractScalarVars(pkgbuildText: string): Map<string, string> {
  const vars = new Map<string, string>();
  let openArrayName: string | null = null;
  let insideFunction = false;

  for (const rawLine of pkgbuildText.split('\n')) {
    if (insideFunction) {
      if (FUNCTION_BODY_END.test(rawLine)) insideFunction = false;
      continue;
    }
    const line = stripInlineComment(rawLine);
    if (FUNCTION_DEFINITION.test(line)) {
      insideFunction = true;
      continue;
    }

    if (openArrayName !== null) {
      openArrayName = captureFirstArrayElement(vars, openArrayName, line);
      continue;
    }

    const defaulted = line.match(DEFAULT_VALUE_ASSIGNMENT);
    if (defaulted?.[1] !== undefined && defaulted[2] !== undefined) {
      vars.set(defaulted[1], unquote(defaulted[2].trim()));
      continue;
    }

    const arrayStart = line.match(ARRAY_ASSIGNMENT_START);
    if (arrayStart?.[1] !== undefined) {
      openArrayName = captureFirstArrayElement(vars, arrayStart[1], arrayStart[2] ?? '');
      continue;
    }

    const scalar = line.match(SCALAR_ASSIGNMENT);
    if (scalar?.[1] !== undefined && scalar[3] !== undefined) vars.set(scalar[1], unquote(scalar[3]));
  }
  return expandVarReferences(vars);
}

/**
 * Removes a trailing `# comment` while respecting quoted values, so entries
 * like `libffi.so # libffi` stay intact and `pkgdesc='a # b'` is not truncated.
 */
export function stripInlineComment(line: string): string {
  let quote: string | null = null;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (index === 0 || /\s/.test(line[index - 1] ?? ''))) return line.slice(0, index).trimEnd();
  }
  return line;
}

/** Records the first element of `NAME=(…)`; bash expands `${NAME}` for arrays to that element. */
function captureFirstArrayElement(vars: Map<string, string>, name: string, rest: string): string | null {
  const closingIndex = rest.indexOf(')');
  const tokens = rest
    .slice(0, closingIndex === -1 ? rest.length : closingIndex)
    .split(/\s+/)
    .filter(Boolean);
  if (!vars.has(name)) {
    const head = tokens[0];
    if (head !== undefined) vars.set(name, unquote(head));
  }
  return closingIndex === -1 ? name : null;
}

/** Strips one matching surrounding quote pair, as PKGBUILD and .SRCINFO values use them. */
export function unquote(value: string): string {
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.endsWith(quote) ? value.slice(1, -1) : value;
}

const MAX_EXPANSION_PASSES = 5;

/**
 * Resolves variables that reference other variables (`pkgname=$_pkgname`),
 * mirroring the top-level evaluation order makepkg uses before reading source=.
 */
function expandVarReferences(vars: Map<string, string>): Map<string, string> {
  const expanded = new Map(vars);
  for (let pass = 0; pass < MAX_EXPANSION_PASSES; pass++) {
    let changed = false;
    for (const [name, value] of expanded) {
      const resolved = substituteVars(value, expanded);
      if (resolved !== null && resolved !== value) {
        expanded.set(name, resolved);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return expanded;
}

/** Makepkg-provided variables that are never declared in the PKGBUILD but have a stable default. */
const MAKEPKG_DEFAULTS: ReadonlyMap<string, string> = new Map([['CARCH', 'x86_64']]);

/**
 * Expands POSIX-style parameter references with the known variables. Supported
 * forms beyond plain `$VAR` / `${VAR}` are default values (`${VAR:-x}`,
 * `${VAR:=x}`, `${VAR-x}`), substring expansion (`${VAR::3}`, `${VAR:2}`,
 * `${VAR:2:3}`) and literal-pattern edits (`${VAR//./-}`, `${VAR/a/b}`,
 * `${VAR#prefix}`, `${VAR%.suffix}`). Patterns with glob characters stay
 * unresolvable, so unusual expansions keep their conservative treatment.
 */
export function substituteVars(template: string, vars: ReadonlyMap<string, string>): string | null {
  const expanded = template.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)([^}]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match, bracedName: string | undefined, operation: string | undefined, bareName: string | undefined) => {
      const name = bareName ?? bracedName;
      if (name === undefined) return match;
      const value = vars.get(name) ?? MAKEPKG_DEFAULTS.get(name);
      if (bareName !== undefined || operation === '' || operation === undefined) {
        return value ?? `\u0000${match}`;
      }
      return applyParameterOperation(match, operation, value);
    },
  );
  if (expanded.includes('\u0000') || expanded.includes('$')) return null;
  return expanded;
}

function applyParameterOperation(match: string, operation: string, value: string | undefined): string {
  const fallbackPrefix = operation.match(/^(?::=|:-|-)/);
  if (fallbackPrefix !== null) {
    const fallback = operation.slice(fallbackPrefix[0].length);
    return value ?? fallback;
  }
  if (value === undefined) return `\u0000${match}`;

  // Braced substring operations always start with the separating colon:
  // `${var:N}` / `${var:N:M}` slice from an offset, `${var::N}` keeps N leading characters.
  const substring = operation.match(/^:(:?)(-?\d+)(?::(-?\d+))?$/);
  if (substring !== null) {
    const [emptyOffset, firstRaw, lengthRaw] = [substring[1], substring[2], substring[3]];
    const first = Number.parseInt(firstRaw ?? '', 10);
    if (Number.isNaN(first)) return `\u0000${match}`;
    return emptyOffset !== '' ? bashPrefix(value, first) : bashRange(value, first, lengthRaw);
  }

  // `${var#pat}` / `${var##pat}` strip a prefix, `${var%pat}` / `${var%%pat}` a suffix.
  const anchored = operation.match(/^(#{1,2}|%{1,2})(.+)$/);
  if (anchored !== null) {
    const pattern = anchored[2];
    if (!isLiteralPattern(pattern)) return `\u0000${match}`;
    return anchored[1].startsWith('#')
      ? value.startsWith(pattern)
        ? value.slice(pattern.length)
        : value
      : value.endsWith(pattern)
        ? value.slice(0, -pattern.length)
        : value;
  }

  // `${var/pat/repl}` replaces the first literal occurrence, `${var//pat/repl}` all of them.
  const replacement = operation.match(/^\/{1,2}(.+)$/);
  if (replacement !== null) {
    const isAll = operation.startsWith('//');
    const body = operation.slice(isAll ? 2 : 1);
    const separator = body.indexOf('/');
    const pattern = separator === -1 ? body : body.slice(0, separator);
    const replacementText = separator === -1 ? '' : body.slice(separator + 1);
    if (!isLiteralPattern(pattern)) return `\u0000${match}`;
    return isAll ? value.split(pattern).join(replacementText) : value.replace(pattern, replacementText);
  }

  return `\u0000${match}`;
}

/** Glob metacharacters would need real bash matching; such patterns stay unresolvable. */
function isLiteralPattern(pattern: string): boolean {
  return pattern !== '' && !/[*?[\]]/.test(pattern);
}

function bashPrefix(value: string, keep: number): string {
  const total = value.length;
  const count = keep < 0 ? Math.max(total + keep, 0) : Math.min(keep, total);
  return value.slice(0, count);
}

function bashRange(value: string, offset: number, lengthRaw: string | undefined): string {
  const total = value.length;
  const start = offset < 0 ? Math.max(total + offset, 0) : Math.min(offset, total);
  if (lengthRaw === undefined) return value.slice(start);
  const length = Number.parseInt(lengthRaw, 10);
  if (Number.isNaN(length)) return value.slice(start);
  const end = length < 0 ? Math.max(total + length, start) : Math.min(start + length, total);
  return value.slice(start, end);
}

export function parsePkgbuild(change: MergeRequestDiffSchema): ParsedPkgbuild | null {
  if (!isInScope(change, PKGBUILD_SCOPE)) return null;
  const numberedLines = [...visibleFileLines(change).entries()];
  const text = numberedLines.map(([, line]) => line).join('\n');
  const vars = extractScalarVars(text);

  // Resolve variables up front so host detection works for "$url/..." style
  // sources and findings display the actual URL instead of the template.
  const entries = (extractArray(text, 'source') ?? []).map((raw) => {
    const entry = parseSourceEntry(substituteVars(raw, vars) ?? raw);
    // The unresolved template is what appears verbatim in the file; use it to locate the line.
    const template = raw.replace(/["']/g, '');
    return { ...entry, line: numberedLines.find(([, line]) => line.includes(template))?.[0] };
  });
  return {
    text,
    entries,
    urlHost: extractUrlHost(text),
    vars,
  };
}

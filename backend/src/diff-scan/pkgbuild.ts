import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import { isInScope, visibleFileLines, type RuleScope } from './rules/diff-utils';

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

const VCS_SOURCE = /(?:^|\s)(?:git|svn|hg|bzr)\+https?:\/\//;
const GIT_URL = /\.git(?:[?#].*)?$/i;
const SCALAR_ASSIGNMENT = /(?:^|\n)\s*([A-Za-z_][A-Za-z0-9_]*)=(["']?)([^"'()\s]+)\2/g;

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
  const stripped = resolved.replace(/^["']|["']$/g, '');
  const separator = stripped.indexOf('::');
  const fileName = separator === -1 ? null : stripped.slice(0, separator);
  const url = separator === -1 ? stripped : stripped.slice(separator + 2);
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
  for (const match of pkgbuildText.matchAll(SCALAR_ASSIGNMENT)) {
    vars.set(match[1], match[3]);
  }
  return vars;
}

/** Makepkg-provided variables that are never declared in the PKGBUILD but have a stable default. */
const MAKEPKG_DEFAULTS: ReadonlyMap<string, string> = new Map([['CARCH', 'x86_64']]);

export function substituteVars(template: string, vars: ReadonlyMap<string, string>): string | null {
  const expanded = template.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match, braced: string | undefined, bare: string | undefined) => {
      const name = braced ?? bare;
      if (name === undefined) return match;
      return vars.get(name) ?? MAKEPKG_DEFAULTS.get(name) ?? `\u0000${match}`;
    },
  );
  if (expanded.includes('\u0000') || expanded.includes('$')) return null;
  return expanded;
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
    const template = raw.replace(/^["']|["']$/g, '');
    return { ...entry, line: numberedLines.find(([, line]) => line.includes(template))?.[0] };
  });
  return {
    text,
    entries,
    urlHost: extractUrlHost(text),
    vars,
  };
}

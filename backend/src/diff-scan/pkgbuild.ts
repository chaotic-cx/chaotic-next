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
  host: string | null;
  isVcs: boolean;
}

export interface ParsedPkgbuild {
  text: string;
  entries: SourceEntry[];
  urlHost: string | null;
  vars: ReadonlyMap<string, string>;
}

function visibleText(change: MergeRequestDiffSchema): string {
  return [...visibleFileLines(change).entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, line]) => line)
    .join('\n');
}

export function extractArray(pkbuildText: string, name: string): string[] | null {
  const match = pkbuildText.match(new RegExp(`(?:^|\\s)${name}=\\(([^)]*)\\)`, 'm'));
  return match ? match[1].split(/\s+/).filter((entry) => entry.length > 0) : null;
}

export function parseSourceEntry(raw: string): SourceEntry {
  const stripped = raw.replace(/^["']|["']$/g, '');
  return {
    raw: stripped,
    host: hostOf(stripped),
    isVcs: isVcsSource(stripped),
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
  const text = visibleText(change);
  return {
    text,
    entries: (extractArray(text, 'source') ?? []).map(parseSourceEntry),
    urlHost: extractUrlHost(text),
    vars: extractScalarVars(text),
  };
}

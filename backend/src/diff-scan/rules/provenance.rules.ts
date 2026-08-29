import {
  extractArray,
  isReputable,
  parsePkgbuild,
  type ParsedPkgbuild,
  type SourceEntry,
  unquote,
  VARIABLE_REFERENCE,
} from '../pkgbuild';
import { type Rule, type RuleHit } from './rule';
import { type MergeRequestDiffSchema } from '@gitbeaker/core';

const GENERIC_FILE_HOST_SUFFIXES = [
  'anonfiles.com',
  'file.io',
  'mediafire.com',
  'mega.nz',
  'netlify.app',
  'pages.dev',
  'pixeldrain.com',
  'r2.dev',
  'vercel.app',
  'wetransfer.com',
  'workers.dev',
];
const SECOND_LEVEL_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'com.au',
  'com.br',
  'com.cn',
  'com.mx',
  'com.sg',
  'com.tr',
  'com.tw',
  'co.in',
  'co.jp',
  'co.kr',
  'co.nz',
  'co.za',
]);

function isGenericFileHost(host: string): boolean {
  const onS3 = host.includes('.s3.') && host.endsWith('.amazonaws.com');
  return onS3 || GENERIC_FILE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
/** Approximation of the registrable domain (last label pair, three for co.uk-style TLDs). */
function registrableDomain(host: string): string {
  const labels = host.split('.');
  const lastTwo = labels.slice(-2).join('.');
  const labelCount = SECOND_LEVEL_SUFFIXES.has(lastTwo) ? 3 : 2;
  return labels.slice(-labelCount).join('.');
}

function firstEntry(change: MergeRequestDiffSchema, predicate: (entry: SourceEntry) => boolean): RuleHit | null {
  const entry = parsePkgbuild(change)?.entries.find(predicate);
  return entry ? { line: entry.line, match: entry.raw, note: `Host: ${entry.host}` } : null;
}

/**
 * Reserved top-level metadata that makepkg resolves from the package's own
 * declarations before expanding `source=`. When one stays unresolved after
 * scanning, the defining line merely fell outside the diff context window;
 * makepkg still resolves it, so the download location is not unknown. The
 * scanner normally folds in the sibling `.SRCINFO` scalars to resolve these;
 * the membership set is the fallback for when no `.SRCINFO` is in the diff.
 */
const MAKEPKG_METADATA_VARS = new Set(['pkgname', 'pkgbase', 'pkgver', 'pkgrel', 'epoch', 'pkgdesc', 'arch', 'url']);

/** True when every unresolved `$` in a source entry references a reserved metadata variable. */
function onlyReservedMetadataRemain(raw: string): boolean {
  return (
    raw
      .replace(VARIABLE_REFERENCE, (whole, bracedName: string, _, bareName: string) =>
        MAKEPKG_METADATA_VARS.has(bracedName ?? bareName) ? '' : whole,
      )
      .includes('$') === false
  );
}

/** Ordered strongest-first, so the first array present decides the verdict. */
const STRONG_CHECKSUM_ARRAYS = ['b2sums', 'sha512sums', 'sha384sums', 'sha256sums', 'sha224sums'];
const WEAK_CHECKSUM_ARRAYS = ['cksums', 'md5sums'];
const CHECKSUM_ARRAYS = [...STRONG_CHECKSUM_ARRAYS, ...WEAK_CHECKSUM_ARRAYS];
const SKIP_CHECKSUM = 'SKIP';

/** A full git SHA embedded in the URL pins the content, making SKIP checksums safe. */
const COMMIT_SHA_IN_URL = /(?:^|[^0-9a-f])[0-9a-f]{40}(?:[^0-9a-f]|$)/i;
/** Detached signatures are verified via GPG, not source checksums. */
const SIGNATURE_FILE = /\.(?:asc|sig)$/i;

const CHECKSUM_RULE: Rule = {
  id: 'SRC-004',
  name: 'Weak or skipped source checksums',
  severity: 'info',
  description:
    'Downloaded sources are not fully verified by a strong checksum. Unverified sources let upstream changes or hijacked downloads reach the build silently.',
  runsOn: ['full-file'],
  check(change) {
    const parsed = parsePkgbuild(change);
    if (!parsed) return null;
    const note = checksumNote(parsed);
    if (note === null) return null;
    const entry = verifiableEntries(parsed.entries)[0];
    return entry ? { line: entry.line, match: entry.raw, note } : { match: 'source=()', note };
  },
};

function isVerifiable(entry: SourceEntry): boolean {
  return !entry.isVcs && !COMMIT_SHA_IN_URL.test(entry.url) && !SIGNATURE_FILE.test(entry.url);
}

function verifiableEntries(entries: SourceEntry[]): SourceEntry[] {
  return entries.filter(isVerifiable);
}

function checksumNote(parsed: ParsedPkgbuild): string | null {
  if (verifiableEntries(parsed.entries).length === 0) return null;

  for (const name of CHECKSUM_ARRAYS) {
    const sums = extractArray(parsed.text, name);
    if (sums === null || sums.length === 0) continue;
    if (!STRONG_CHECKSUM_ARRAYS.includes(name)) {
      return `sources are only covered by weak checksums (${name})`;
    }
    return skippedChecksumNote(parsed.entries, sums);
  }
  return 'no checksum array covers the downloaded sources';
}

function skippedChecksumNote(entries: SourceEntry[], sums: string[]): string | null {
  if (sums.length !== entries.length) return null;
  const index = entries.findIndex(
    (entry, position) => isVerifiable(entry) && unquote(sums[position] ?? '').toUpperCase() === SKIP_CHECKSUM,
  );
  if (index === -1) return null;
  return `checksum for "${sourceFileName(entries[index])}" is SKIP`;
}

function sourceFileName(entry: SourceEntry): string {
  return entry.fileName ?? entry.url.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? entry.raw;
}

/**
 * Hosts that legitimately differ from url=: distro and language-registry
 * infrastructure plus official vendor mirrors. Deliberately excludes
 * attacker-choosable object storage (buckets stay in SRC-002).
 */
const TRUSTED_MIRROR_SUFFIXES = [
  'apt.insync.io',
  'bcr.bazel.build',
  'code.sf.net',
  'dl.google.com',
  'downloads.slack-edge.com',
  'lkml.org',
  'packages.linuxmint.com',
  'pypi.io',
  'src.fedoraproject.org',
  'web.archive.org',
  'wrapdb.mesonbuild.com',
];

function isTrustedMirror(host: string): boolean {
  return TRUSTED_MIRROR_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export const PROVENANCE_RULES: Rule[] = [
  {
    id: 'SRC-001',
    name: 'VCS source outside reputable forges',
    severity: 'warning',
    description:
      'Clones a git repository from a host outside the well-known forges and upstreams. Verify the repository actually belongs to the package.',
    check(change) {
      return firstEntry(change, (entry) => entry.isVcs && entry.host !== null && !isReputable(entry.host));
    },
  },
  {
    id: 'SRC-002',
    name: 'Source on generic file host',
    severity: 'warning',
    description:
      'Downloads from object storage or a file-drop host whose names are attacker-choosable, so the URL proves nothing about provenance.',
    check(change) {
      return firstEntry(change, (entry) => entry.host !== null && isGenericFileHost(entry.host));
    },
  },
  {
    id: 'SRC-003',
    name: 'Source host unrelated to upstream',
    severity: 'warning',
    description:
      'Downloads from a host that matches neither the package url= domain nor a reputable forge. The CHAOS-RAT campaign smuggled payloads this way, disguised as patches.',
    check(change) {
      const parsed = parsePkgbuild(change);
      if (!parsed?.urlHost) return null;
      const upstreamDomain = registrableDomain(parsed.urlHost);
      const entry = parsed.entries.find(
        (candidate) =>
          candidate.host !== null &&
          !isReputable(candidate.host) &&
          !isTrustedMirror(candidate.host) &&
          registrableDomain(candidate.host) !== upstreamDomain,
      );
      return entry
        ? { line: entry.line, match: entry.raw, note: `Host ${entry.host} vs upstream ${parsed.urlHost}` }
        : null;
    },
  },
  {
    id: 'CAUR-UNRESOLVED-SOURCE',
    name: 'Unresolvable source location',
    severity: 'warning',
    description:
      'A source entry still contains unresolved variables after PKGBUILD parsing, so its final download host can be neither determined nor reviewed. Verify where the download actually comes from.',
    check(change) {
      const parsed = parsePkgbuild(change);
      const entry = parsed?.entries.find(
        (candidate) => candidate.raw.includes('$') && !onlyReservedMetadataRemain(candidate.raw),
      );
      return entry ? { line: entry.line, match: entry.raw, note: 'Source contains unresolved variables' } : null;
    },
  },
  CHECKSUM_RULE,
];

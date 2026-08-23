import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import { isReputable, parsePkgbuild, type SourceEntry } from '../pkgbuild';
import type { Rule, RuleHit } from './rule';

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
      const entry = parsed?.entries.find((candidate) => candidate.raw.includes('$'));
      return entry ? { line: entry.line, match: entry.raw, note: 'Source contains unresolved variables' } : null;
    },
  },
];

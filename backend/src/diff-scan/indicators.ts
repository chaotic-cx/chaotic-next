import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import { extractArray, hostOf, isReputable, isVcsSource, parsePkgbuild, substituteVars } from './pkgbuild';
import { addedLines, isInScope } from './rules/diff-utils';

export const MAX_INDICATORS_PER_MR = 20;

export type ScanIndicatorType = 'url' | 'file';

export interface ScanIndicator {
  type: ScanIndicatorType;
  value: string;
  context: string;
}

const ADDED_URL = /https?:\/\/[^\s"'<>\\]+/g;
const SHA256 = /^[0-9a-f]{64}$/;
const PRIVATE_OR_LOOPBACK_HOST = /^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
const WEB_PAGE_EXTENSION = /\.(?:html?|php|asp|aspx|jsp|cgi)$/i;
const DOC_PATH_SEGMENT = new Set([
  'about',
  'blog',
  'changelog',
  'community',
  'contact',
  'cookies',
  'documentation',
  'docs',
  'faq',
  'help',
  'home',
  'index',
  'legal',
  'license',
  'licenses',
  'news',
  'privacy',
  'releases',
  'release-notes',
  'security',
  'support',
  'terms',
  'tos',
]);

export function extractIndicators(diffs: MergeRequestDiffSchema[]): ScanIndicator[] {
  const seen = new Set<string>();
  const indicators: ScanIndicator[] = [];

  const add = (indicator: ScanIndicator): void => {
    const key = `${indicator.type}:${indicator.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    indicators.push(indicator);
  };

  for (const change of diffs) {
    if (change.deleted_file) continue;
    if (indicators.length >= MAX_INDICATORS_PER_MR) break;

    const pkgbuild = parsePkgbuild(change);
    if (pkgbuild) {
      const checksums = extractArray(pkgbuild.text, 'sha256sums');
      pkgbuild.entries.forEach((entry, index) => {
        if (entry.isVcs) return;
        const url = checkableSource(entry.raw, pkgbuild.vars);
        if (url) add({ type: 'url', value: url, context: `${change.new_path} (source)` });
        const hash = checksums?.[index]?.replace(/["']/g, '') ?? '';
        if (SHA256.test(hash)) {
          add({ type: 'file', value: hash, context: `${change.new_path} (source checksum)` });
        }
      });
    }

    if (!isInScope(change, ['code'])) continue;
    for (const line of addedLines(change)) {
      for (const match of line.text.matchAll(ADDED_URL)) {
        const url = checkableUrl(match[0]);
        if (url) add({ type: 'url', value: url, context: `${change.new_path}:${line.line}` });
      }
    }
  }
  return indicators.slice(0, MAX_INDICATORS_PER_MR);
}

function stripTrailingShellPunctuation(raw: string): string {
  return raw.replace(/[.,;:!?)\]]+$/, '');
}

function checkableUrl(raw: string): string | null {
  const url = stripTrailingShellPunctuation(raw);
  if (!/^https?:\/\//i.test(url) || isVcsSource(url)) return null;
  const host = hostOf(url);
  if (host === null || isReputable(host) || PRIVATE_OR_LOOPBACK_HOST.test(host)) return null;
  return isDocumentationPage(url) ? null : url;
}

function checkableSource(raw: string, vars: ReadonlyMap<string, string>): string | null {
  const expanded = substituteVars(raw, vars);
  return expanded === null ? null : checkableUrl(expanded);
}

function isDocumentationPage(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname.replace(/\/+$/, '');
  } catch {
    return false;
  }
  if (path === '') return true;
  const segments = path.split('/').filter(Boolean);
  const firstSegment = segments[0]?.toLowerCase() ?? '';
  const lastSegment = segments[segments.length - 1]?.toLowerCase() ?? '';
  return (
    WEB_PAGE_EXTENSION.test(lastSegment) || DOC_PATH_SEGMENT.has(firstSegment) || DOC_PATH_SEGMENT.has(lastSegment)
  );
}

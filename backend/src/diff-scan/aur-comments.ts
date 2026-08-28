import * as cheerio from 'cheerio';
import { type DiffScanFinding, type DiffScanSeverity } from '@chaotic-next/shared-lib';

/** Votes or popularity at which community warnings decay quickly, mirroring the traur model. */
const POPULAR_VOTES = 3;
const POPULAR_POPULARITY = 0.01;
/** Warnings younger than this on popular packages escalate to critical. */
const RECENT_WARNING_DAYS = 7;
/** Community warnings older than this stop firing on popular packages entirely. */
const STALE_WARNING_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const THREAT_KEYWORD =
  /\b(?:malware|backdoor|viruses?|trojan(?:ed|ized|s)?|compromised|keylogger|credential theft|cryptojacking|miner|do not install|removed from the aur|(?:steals?|stole)\s+(?:\w+\s+){0,2}(?:passwords?|credentials?|logins?|tokens?|cookies?))\b/i;
const MITIGATION_PHRASE =
  /\b(?:patched|fixed|not compromised|false positive|wrong package|different package|resolved|cleaned up|safe again)\b/i;

export interface AurComment {
  id: number;
  username: string;
  postedAt: Date;
  editedAt: Date | null;
  body: string;
}

export interface AurCommentThreatVerdict {
  severity: DiffScanSeverity;
  comment: AurComment;
  ageDays: number;
  popular: boolean;
  mitigated: boolean;
}

/**
 * Parses an AUR package page into its comments. The parser pairs each header
 * with its body through the numeric comment id, because attribute order varies.
 */
export function parseAurComments(html: string): AurComment[] {
  const $ = cheerio.load(html);
  const comments: AurComment[] = [];

  for (const element of $('div[id^="comment-"][id$="-content"]').toArray()) {
    const id = Number(/^comment-(\d+)-content$/.exec($(element).attr('id') ?? '')?.[1]);
    if (!Number.isInteger(id) || id <= 0) continue;

    const dateLink = $(`h4.comment-header a[href="#comment-${id}"]`).first();
    if (dateLink.length === 0) continue;
    const header = dateLink.closest('h4');

    const headerClone = header.clone();
    headerClone.find('.edited').remove();
    const username = /^\s*(\S+)\s+commented on\s/.exec(headerClone.text())?.[1];
    const postedAt = parseAurDate(dateLink.text());
    if (!username || !postedAt) continue;

    const editedOn = /edited on (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/.exec(header.find('.edited').text())?.[1] ?? '';
    comments.push({
      id,
      username,
      postedAt,
      editedAt: parseAurDate(editedOn),
      body: normalizeWhitespace($(element).text()),
    });
  }
  return comments.sort((left, right) => left.postedAt.getTime() - right.postedAt.getTime());
}

function parseAurDate(timestamp: string): Date | null {
  const withoutZone = timestamp.trim().replace(/\s*\(UTC\)$/, '');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(withoutZone)) return null;
  return new Date(Date.parse(`${withoutZone.replace(' ', 'T')}:00Z`));
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Time-aware community-threat check that follows the traur model.
 * On popular packages, community warnings decay with age because attention
 * corrects problems quickly. On low-traffic packages, warnings persist until a
 * later comment reports a fix. Such a later comment downgrades the verdict.
 */
export function evaluateCommentThreats(
  comments: readonly AurComment[],
  meta: { votes: number; popularity: number },
  nowMs: number = Date.now(),
): AurCommentThreatVerdict | null {
  const threats = comments.filter((comment) => THREAT_KEYWORD.test(comment.body));
  if (threats.length === 0) return null;

  const newestThreat = threats.reduce((newest, comment) => (comment.postedAt > newest.postedAt ? comment : newest));
  const mitigated = comments.some(
    (comment) => comment.postedAt > newestThreat.postedAt && MITIGATION_PHRASE.test(comment.body),
  );
  const popular = meta.votes >= POPULAR_VOTES || meta.popularity >= POPULAR_POPULARITY;
  const ageDays = Math.max(0, Math.floor((nowMs - newestThreat.postedAt.getTime()) / DAY_MS));

  if (popular) {
    if (ageDays < RECENT_WARNING_DAYS && !mitigated) {
      return { severity: 'critical', comment: newestThreat, ageDays, popular, mitigated };
    }
    if (ageDays > STALE_WARNING_DAYS) return null;
  }
  return { severity: 'warning', comment: newestThreat, ageDays, popular, mitigated };
}

export function commentThreatFinding(verdict: AurCommentThreatVerdict, packageBase: string): DiffScanFinding {
  const context = [
    verdict.popular ? 'popular package' : 'low-traffic package',
    `warning posted ${verdict.ageDays} day(s) ago by ${verdict.comment.username}`,
    verdict.mitigated ? 'later comments report it resolved' : 'no later comment reports resolution',
  ].join(', ');
  return {
    ruleId: 'CAUR-COMMENT-THREAT',
    ruleName: 'Community malware warning',
    severity: verdict.severity,
    description: `AUR comments flag this package (${context}). Examine the comments before you trust the package.`,
    file: `${packageBase}/#comments`,
    match: verdict.comment.body.slice(0, 160),
  };
}

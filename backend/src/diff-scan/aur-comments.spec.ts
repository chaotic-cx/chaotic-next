import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateCommentThreats, parseAurComments, type AurComment } from './aur-comments';

const FIXTURE = readFileSync(
  join(import.meta.dirname, '__fixtures__', 'aur', 'google-chrome', 'comments.html'),
  'utf-8',
);
const NOW_MS = Date.parse('2026-08-25T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('parseAurComments against the real google-chrome page', () => {
  const comments = parseAurComments(FIXTURE);

  it('pairs every header with a body by numeric id', () => {
    expect(comments).toHaveLength(11);
    expect(comments.map((comment) => comment.id)).toEqual([
      910450, 1066432, 1066473, 1066483, 1080004, 1080435, 1081210, 1081267, 1082520, 1082793, 1082801,
    ]);
  });

  it('extracts usernames, UTC dates and edited markers', () => {
    const gromit = comments.find((comment) => comment.username === 'gromit');
    expect(gromit?.id).toBe(910450);
    expect(gromit?.postedAt.toISOString()).toBe('2023-04-15T08:22:00.000Z');
    expect(gromit?.editedAt?.toISOString()).toBe('2023-05-08T21:42:00.000Z');

    const unedited = comments.find((comment) => comment.id === 1082801);
    expect(unedited?.username).toBe('idanka');
    // The real page shows this comment was edited two minutes after posting.
    expect(unedited?.editedAt?.toISOString()).toBe('2026-08-23T12:03:00.000Z');
  });

  it('decodes entities and keeps pre-formatted command text through nested divs', () => {
    const gromit = comments[0];
    expect(gromit.body).toContain('"Package: google-chrome-stable"');
    expect(gromit.body).toContain("awk '/Version/{print $2}'");
    expect(gromit.body).toContain('report updates for ChromeOS');
  });
});

function comment(body: string, ageDays: number, id = 1): AurComment {
  return { id, username: 'reporter', postedAt: new Date(NOW_MS - ageDays * DAY_MS), editedAt: null, body };
}

const POPULAR_META = { votes: 5, popularity: 0.1 };
const OBSCURE_META = { votes: 0, popularity: 0 };

describe('evaluateCommentThreats', () => {
  it('ignores packages without threatening comments', () => {
    expect(evaluateCommentThreats([comment('great package', 1)], POPULAR_META, NOW_MS)).toBeNull();
  });

  it('escalates recent warnings on popular packages to critical', () => {
    const verdict = evaluateCommentThreats([comment('this is malware, do not install', 2)], POPULAR_META, NOW_MS);
    expect(verdict?.severity).toBe('critical');
    expect(verdict?.popular).toBe(true);
    expect(verdict?.ageDays).toBe(2);
  });

  it('degrades mid-age warnings on popular packages to warnings', () => {
    const verdict = evaluateCommentThreats([comment('contains a backdoor', 30)], POPULAR_META, NOW_MS);
    expect(verdict?.severity).toBe('warning');
  });

  it('stops firing on stale warnings of popular packages', () => {
    expect(evaluateCommentThreats([comment('this is malware', 90)], POPULAR_META, NOW_MS)).toBeNull();
  });

  it('keeps old unmitigated warnings alive on low-traffic packages', () => {
    const verdict = evaluateCommentThreats([comment('package stole my login tokens', 200)], OBSCURE_META, NOW_MS);
    expect(verdict?.severity).toBe('warning');
    expect(verdict?.popular).toBe(false);
  });

  it('downgrades when a later comment reports resolution', () => {
    const comments = [comment('this is malware', 4), comment('false positive, was fixed upstream', 1)];
    const verdict = evaluateCommentThreats(comments, POPULAR_META, NOW_MS);
    expect(verdict?.severity).toBe('warning');
    expect(verdict?.mitigated).toBe(true);
  });

  it('ignores mitigation posted before the warning', () => {
    const comments = [comment('not compromised, all good', 10), comment('actually it has a trojan payload', 2)];
    const verdict = evaluateCommentThreats(comments, POPULAR_META, NOW_MS);
    expect(verdict?.severity).toBe('critical');
    expect(verdict?.mitigated).toBe(false);
  });

  it('uses the newest of several warnings', () => {
    const comments = [comment('old backdoor report', 40, 10), comment('still malware today', 3, 20)];
    const verdict = evaluateCommentThreats(comments, POPULAR_META, NOW_MS);
    expect(verdict?.comment.id).toBe(20);
    expect(verdict?.ageDays).toBe(3);
  });
});

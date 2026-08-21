import { describe, expect, it } from 'vitest';
import { parseManagerLogEvent } from './manager-log-parser';

const R = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

function sseDataLine(payload: object): string {
  return `data: ${JSON.stringify(payload)}`;
}

describe('parseManagerLogEvent', () => {
  it('formats a standard DATABASE log entry with colors', () => {
    const line = sseDataLine({
      level: 'info',
      mod: 'DATABASE',
      msg: 'Extracting chaotic-aur.db.tar.zst to a temporary location...',
      seq: 185,
      ts: 1787345553366,
    });

    const result = parseManagerLogEvent(line);

    expect(result).toBe(
      `${DIM}2026-08-21T20:52:33.366Z${R} ${BOLD}${GREEN}INFO ${R} ${YELLOW}DATABASE${R}: Extracting chaotic-aur.db.tar.zst to a temporary location...\n`,
    );
  });

  it('formats a BUILD log entry with magenta module color', () => {
    const line = sseDataLine({
      level: 'info',
      mod: 'BUILD',
      msg: 'Build job chaotic-aur/x86_64/opencode-bin finished at 21/08/2026, 21:01:55 UTC...',
      seq: 203,
      ts: 1787345571671,
    });

    const result = parseManagerLogEvent(line);

    expect(result).toBe(
      `${DIM}2026-08-21T20:52:51.671Z${R} ${BOLD}${GREEN}INFO ${R} ${MAGENTA}BUILD${R}: Build job chaotic-aur/x86_64/opencode-bin finished at 21/08/2026, 21:01:55 UTC...\n`,
    );
  });

  it('formats a CHAOTIC log entry with cyan module color', () => {
    const line = sseDataLine({
      level: 'info',
      mod: 'CHAOTIC',
      msg: 'Job for opencode-bin finished on node stormwing-2-dkq6y.',
      seq: 204,
      ts: 1787345572102,
    });

    const result = parseManagerLogEvent(line);

    expect(result).toBe(
      `${DIM}2026-08-21T20:52:52.102Z${R} ${BOLD}${GREEN}INFO ${R} ${CYAN}CHAOTIC${R}: Job for opencode-bin finished on node stormwing-2-dkq6y.\n`,
    );
  });

  it('formats a WARN entry with yellow level color', () => {
    const line = sseDataLine({
      level: 'warn',
      mod: 'BUILD',
      msg: 'Build took too long',
      seq: 10,
      ts: 1787345553366,
    });

    const result = parseManagerLogEvent(line);

    expect(result).toBe(
      `${DIM}2026-08-21T20:52:33.366Z${R} ${BOLD}${YELLOW}WARN ${R} ${MAGENTA}BUILD${R}: Build took too long\n`,
    );
  });

  it('formats an ERROR entry with red level color', () => {
    const line = sseDataLine({
      level: 'error',
      mod: 'BUILD',
      msg: 'Build failed',
      seq: 11,
      ts: 1787345553366,
    });

    const result = parseManagerLogEvent(line);

    expect(result).toBe(
      `${DIM}2026-08-21T20:52:33.366Z${R} ${BOLD}${RED}ERROR${R} ${MAGENTA}BUILD${R}: Build failed\n`,
    );
  });

  it('filters out HTTP module entries', () => {
    const line = sseDataLine({
      level: 'info',
      mod: 'HTTP',
      msg: 'GET ::ffff:172.18.0.1 /api/queue/stats 200 0.821ms',
      seq: 200,
      ts: 1787345559501,
    });

    expect(parseManagerLogEvent(line)).toBeUndefined();
  });

  it('returns the raw payload when JSON parsing fails', () => {
    const line = 'data: not-json-at-all';

    expect(parseManagerLogEvent(line)).toBe('not-json-at-all\n');
  });

  it('returns undefined when the entry has no msg field', () => {
    const line = sseDataLine({ level: 'info', mod: 'DATABASE', seq: 1 });

    expect(parseManagerLogEvent(line)).toBeUndefined();
  });

  it('handles entries without a ts field', () => {
    const line = sseDataLine({ level: 'error', mod: 'BUILD', msg: 'Build failed' });

    const result = parseManagerLogEvent(line);

    expect(result).toBe(`${BOLD}${RED}ERROR${R} ${MAGENTA}BUILD${R}: Build failed\n`);
  });

  it('handles entries without a level field', () => {
    const line = sseDataLine({ mod: 'CHAOTIC', msg: 'Job finished', ts: 1787345572102 });

    const result = parseManagerLogEvent(line);

    expect(result).toBe(`${DIM}2026-08-21T20:52:52.102Z${R} ${CYAN}CHAOTIC${R}: Job finished\n`);
  });

  it('handles entries without a mod field', () => {
    const line = sseDataLine({ level: 'info', msg: 'Something happened', ts: 1787345553366 });

    const result = parseManagerLogEvent(line);

    expect(result).toBe(`${DIM}2026-08-21T20:52:33.366Z${R} ${BOLD}${GREEN}INFO ${R} Something happened\n`);
  });
});

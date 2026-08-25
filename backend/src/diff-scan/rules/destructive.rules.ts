import type { Rule } from './rule';
import { addedLines, isCommentLine, isInScope } from './diff-utils';

const RM_RECURSIVE = /\brm\s[^;&|]*?(?:-[a-z]*r[a-z]*\b|--recursive\b)/i;
const RM_FORCED = /(?:^|\s)(?:-[a-z]*f[a-z]*\b|--force\b)/i;
const SENSITIVE_TARGET =
  /\s["']?(?:\/\*?|~|\$HOME|\$\{HOME\})["']?(?:\/|\s|$)|\s\/(?:home|etc|usr|var|boot|opt|srv|root|lib|bin|sbin)(?:\/|\s|$)/;
/** Disk tools count only when invoked against a device, not when a package merely ships them. */
const COMMAND_POSITION = '(?:^|[;&|]\\s*|\\b(?:sudo|doas)\\s+)';
const DISK_WIPE = new RegExp(
  `${COMMAND_POSITION}\\bmkfs(?:\\.\\w+)?\\s[^;&|]*\\/dev\\/` +
    `|${COMMAND_POSITION}\\bwipefs\\b` +
    '|\\bdd\\b[^;&|]*\\bof=\\/dev\\/',
  'i',
);

export const DESTRUCTIVE_RULES: Rule[] = [
  {
    id: 'CAUR-DESTRUCTIVE',
    name: 'Destructive filesystem command',
    severity: 'critical',
    description:
      'Runs a destructive command: rm with recursive force against system or home paths, recursive rm inside an install scriptlet (which runs as root on user machines), or a disk-wiping tool.',
    check(change) {
      if (!isInScope(change, ['code'])) return null;
      const installScript = isInScope(change, ['install']);
      for (const line of addedLines(change)) {
        if (isCommentLine(line.text)) continue;
        const destructive =
          DISK_WIPE.test(line.text) ||
          (RM_RECURSIVE.test(line.text) &&
            (installScript || (RM_FORCED.test(line.text) && SENSITIVE_TARGET.test(line.text))));
        if (destructive) return { line: line.line, match: line.text.trim() };
      }
      return null;
    },
  },
];

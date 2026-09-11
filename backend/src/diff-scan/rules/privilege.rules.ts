import { addedLines, isCommentLine, isInScope } from './diff-utils';
import { regexRule, type Rule } from './rule';

/** Octal special-bit prefix that carries setgid but no setuid. */
const SETGID_ONLY_PREFIX = '2';
/** Helpers that upstream ships requiring the setuid bit to function at all. */
const UPSTREAM_SETUID_HELPERS = /(?:chrome|msedge)-sandbox|nvidia-modprobe|qemu-bridge-helper/;

function isInsideQuoted(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const doubleQuotes = before.match(/(?<!\\)"/g)?.length ?? 0;
  const singleQuotes = before.match(/(?<!\\)'/g)?.length ?? 0;
  return doubleQuotes % 2 === 1 || singleQuotes % 2 === 1;
}

export const PRIVILEGE_RULES: Rule[] = [
  {
    id: 'PRIV-001',
    name: 'Privilege escalation in build/install script',
    severity: 'critical',
    description:
      'PKGBUILDs run as the building user and install scriptlets already run as root, so invoking sudo/doas/pkexec there is a red flag.',
    check(change) {
      const pattern = /(?<![-\w=\\/.(])\b(?:sudo|doas|pkexec)\b(?=\s)/;
      const skipArray = /^\s*(?:depends|makedepends|optdepends|checkdepends)\s*=/;
      if (!isInScope(change, ['pkgbuild', 'install'])) return null;
      for (const line of addedLines(change)) {
        if (isCommentLine(line.text)) continue;
        if (skipArray.test(line.text)) continue;
        const m = line.text.match(pattern);
        if (!m) continue;
        // Skip quoted strings like optdepends description or echo messages.
        const idx = m.index ?? 0;
        const before = line.text.slice(0, idx);
        const dq = before.match(/(?<!\\)"/g)?.length ?? 0;
        const sq = before.match(/(?<!\\)'/g)?.length ?? 0;
        if (dq % 2 === 1 || sq % 2 === 1) continue;
        // Packaging `sudo make install` with DESTDIR/PREFIX is bad practice but not malware; skip to reduce FP.
        if (/\bsudo\b.*\bmake\b.*(?:DESTDIR|PREFIX)/.test(line.text)) continue;
        // `Run sudo pacman -R ...` in echo message is documentation, skip.
        if (/^\s*Run sudo\b/.test(line.text.trim())) continue;
        return { line: line.line, match: line.text.trim() };
      }
      return null;
    },
  },
  {
    id: 'PRIV-003',
    name: 'Sudoers modification',
    severity: 'critical',
    description: 'Modifies sudo configuration or passwordless sudo rules, a persistence mechanism for attackers.',
    check(change) {
      const pattern = /\/etc\/sudoers|\/etc\/sudoers\.d\/|NOPASSWD/;
      const skipDirCreate = /install\s+.*-d\b.*\/etc\/sudoers\.d/;
      if (!isInScope(change, ['code'])) return null;
      for (const line of addedLines(change)) {
        if (isCommentLine(line.text)) continue;
        if (!pattern.test(line.text)) continue;
        if (skipDirCreate.test(line.text)) continue;
        // Skip `install -d -m 0750` for sudoers.d directory creation (legitimate for packages needing sudoers).
        if (/install\s+-d/.test(line.text) && /\/etc\/sudoers\.d/.test(line.text)) continue;
        return { line: line.line, match: line.text.trim() };
      }
      return null;
    },
  },
  {
    id: 'CAUR-SETUID',
    name: 'Setuid binary creation',
    severity: 'critical',
    description:
      'Installs or marks a binary with setuid/setgid bits, letting any user execute it with elevated privileges.',
    check(change) {
      const pattern = /\bchmod\b[^#\n]*\b(?:u\+s|g\+s|[246][0-7]{3})\b|\binstall\b[^#\n]*-[A-Za-z]*m\s*[246][0-7]{3}\b/;
      if (!isInScope(change, ['code'])) return null;
      for (const line of addedLines(change)) {
        if (isCommentLine(line.text)) continue;
        const match = line.text.match(pattern);
        if (!match) continue;
        if (isInsideQuoted(line.text, match.index ?? 0)) continue;
        const octalMode = line.text.match(/([246][0-7]{3})/);
        const leadingDigit = octalMode?.[1]?.[0];
        const setuid = leadingDigit ? leadingDigit !== SETGID_ONLY_PREFIX : /\bu\+s\b/.test(line.text);
        if (!setuid) continue;
        if (UPSTREAM_SETUID_HELPERS.test(line.text)) continue;
        // 6444 for icons has no execute bits: not a setuid binary, skip.
        if (octalMode && (Number.parseInt(octalMode[1], 8) & 0o111) === 0) continue;
        return { line: line.line, match: line.text.trim() };
      }
      return null;
    },
  },
  regexRule({
    id: 'CAUR-ADMIN-GROUP',
    name: 'Admin group membership change',
    severity: 'critical',
    description: 'Adds accounts to wheel/sudo/root groups, a classic privilege-granting backdoor.',
    pattern: /\busermod\b[^#\n]*\b(?:wheel|sudo|root)\b|\bgpasswd\b[^#\n]*\s-a\b/,
    scopes: ['code'],
    skipQuoted: true,
  }),
  regexRule({
    id: 'CAUR-UID0-USER',
    name: 'UID-0 account creation',
    severity: 'critical',
    description: 'Creates a user with UID 0 or duplicate-UID (-o). The result is an untracked root-equivalent account.',
    pattern: /\buseradd\b[^#\n]*(?:\s-o\b|\s-u\s*=?\s*0\b|\s--uid\s*=?\s*0\b)/,
    scopes: ['code'],
    skipQuoted: true,
  }),
  regexRule({
    id: 'CAUR-PASSWORD-DELETE',
    name: 'Password deletion',
    severity: 'critical',
    description: 'Deletes an account password. The account then allows login without a password.',
    pattern: /\bpasswd\s+(?:-[a-z]*d[a-z]*|--delete)\b/,
    scopes: ['code'],
    skipQuoted: true,
  }),
];

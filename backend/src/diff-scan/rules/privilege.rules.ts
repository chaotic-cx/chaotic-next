import { regexRule, type DiffScanRule } from './rule';

export const PRIVILEGE_RULES: DiffScanRule[] = [
  regexRule({
    id: 'PRIV-001',
    name: 'Privilege escalation in build/install script',
    severity: 'critical',
    description:
      'PKGBUILDs run as the building user and install scriptlets already run as root, so invoking sudo/doas/pkexec there is a red flag.',
    // Only actual invocations count; package names and build flags containing these
    // words (sudo-git, -Dprivileged_group=sudo) are benign.
    pattern: /(?<![\w=\\/.-])\b(?:sudo|doas|pkexec)\b(?=\s)/,
    scopes: ['pkgbuild', 'install'],
    skipQuoted: true,
  }),
  regexRule({
    id: 'PRIV-003',
    name: 'Sudoers modification',
    severity: 'critical',
    description: 'Modifies sudo configuration or passwordless sudo rules, a persistence mechanism for attackers.',
    pattern: /\/etc\/sudoers|\/etc\/sudoers\.d\/|NOPASSWD/,
  }),
];

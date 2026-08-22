import { regexRule, type Rule } from './rule';

export const PRIVILEGE_RULES: Rule[] = [
  regexRule({
    id: 'PRIV-001',
    name: 'Privilege escalation in build/install script',
    severity: 'critical',
    description:
      'PKGBUILDs run as the building user and install scriptlets already run as root, so invoking sudo/doas/pkexec there is a red flag.',
    // Only actual invocations count; package names, build flags and unquoted array
    // elements containing these words (sudo-git, depends=(sudo curl), -Dprivileged_group=sudo)
    // are benign.
    pattern: /(?<![-\w=\\/.(])\b(?:sudo|doas|pkexec)\b(?=\s)/,
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

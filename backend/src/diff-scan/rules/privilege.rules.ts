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
  regexRule({
    id: 'CAUR-SETUID',
    name: 'Setuid binary creation',
    severity: 'critical',
    description:
      'Installs or marks a binary with setuid/setgid bits, letting any user execute it with elevated privileges.',
    // Octal modes starting 4/2/6 carry setuid/setgid; 1xxx is only the sticky bit.
    // makepkg glues install modes to the flag (-Dm4755), chmod separates them.
    pattern: /\bchmod\b[^#\n]*\b(?:u\+s|g\+s|[246][0-7]{3})\b|\binstall\b[^#\n]*-[A-Za-z]*m\s*[246][0-7]{3}\b/,
    scopes: ['code'],
    skipQuoted: true,
  }),
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
    description: 'Creates a user with UID 0 or duplicate-UID (-o), planting an untracked root-equivalent account.',
    pattern: /\buseradd\b[^#\n]*(?:\s-o\b|\s-u\s*=?\s*0\b|\s--uid\s*=?\s*0\b)/,
    scopes: ['code'],
    skipQuoted: true,
  }),
  regexRule({
    id: 'CAUR-PASSWORD-DELETE',
    name: 'Password deletion',
    severity: 'critical',
    description: 'Deletes an account password, enabling passwordless login to the target account.',
    pattern: /\bpasswd\s+(?:-[a-z]*d[a-z]*|--delete)\b/,
    scopes: ['code'],
    skipQuoted: true,
  }),
];

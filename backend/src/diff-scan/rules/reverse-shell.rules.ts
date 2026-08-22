import { regexRule, type Rule } from './rule';

export const REVERSE_SHELL_RULES: Rule[] = [
  regexRule({
    id: 'SHELL-001',
    name: 'Bash reverse shell',
    severity: 'critical',
    description: 'Bash /dev/tcp redirections are the building block of reverse shells.',
    pattern: /\/dev\/tcp\//,
  }),
  regexRule({
    id: 'SHELL-002',
    name: 'Netcat reverse shell',
    severity: 'critical',
    description: 'Netcat executed with a command to run (-e) is a classic reverse shell pattern.',
    pattern: /\bn(?:c|cat|etcat)\b[^\n]*\s-{1,2}e\b/,
  }),
  regexRule({
    id: 'SHELL-003',
    name: 'Python reverse shell',
    severity: 'critical',
    description: 'Raw sockets or PTY spawning in Python are typical reverse shell ingredients.',
    pattern: /socket\.socket\(|pty\.spawn/i,
  }),
  regexRule({
    id: 'SHELL-004',
    name: 'Socat shell',
    severity: 'critical',
    description: 'Socat executing a command is commonly used for encrypted reverse shells.',
    pattern: /\bsocat\b[^\n]*\bexec\b/i,
  }),
];

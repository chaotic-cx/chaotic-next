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
    description: 'Netcat executed with a command to run (-e / --exec) is a classic reverse shell pattern.',
    pattern: /\bn(?:c|cat|etcat)\b[^\n]*\s(?:-{1,2}e\b|--exec\b)/,
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
    description: 'Socat executing a command (EXEC/SYSTEM address) is commonly used for encrypted reverse shells.',
    pattern: /\bsocat\b[^\n]*\b(?:exec|system)\b/i,
  }),
  regexRule({
    id: 'CAUR-OPENSSL-SHELL',
    name: 'Encrypted shell via OpenSSL',
    severity: 'critical',
    description:
      'Pipes openssl s_client output into a shell, an encrypted reverse channel that evades plain-text inspection.',
    pattern: /\bopenssl\b[^|#\n]*\bs_client\b[^|]*\|\s*(?:sudo\s+|doas\s+)?(?:ba|z|da|k)?sh\b/i,
  }),
  regexRule({
    id: 'CAUR-NETPIPE-SHELL',
    name: 'Shell over network pipe',
    severity: 'critical',
    description:
      'Pipes a network tool into a shell or shell output into netcat/telnet — interactive remote access (also the mkfifo netcat pattern) without a dedicated payload.',
    pattern:
      /\b(?:nc|ncat|netcat|telnet)\b[^|#\n]*\|\s*(?:sudo\s+|doas\s+)?(?:ba|z|da|k)?sh\b|(?:ba|z|da|k)?sh\b[^|#\n]*\|\s*(?:sudo\s+)?\bn(?:c|cat)\b/i,
  }),
];

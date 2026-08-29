import { regexRule, type Rule } from './rule';

const PASTE_HOSTS = ['0x0.st', 'paste.ee', 'pastebin.com', 'ptpb.pw', 'temp.sh', 'transfer.sh'];
// The lookbehind keeps hostnames like mypastebin.com out, mirroring the network
// rules' host boundary; subdomains (evil.pastebin.com) still match via the label prefix.
const pasteHostsPattern = new RegExp(
  `(?<![a-z0-9-])(?:[\\w-]+\\.)*(?:${PASTE_HOSTS.join('|').replace(/\./g, '\\.')})(?:/|\\s|$)`,
  'i',
);

export const DOWNLOAD_EXECUTE_RULES: Rule[] = [
  regexRule({
    id: 'DLE-001',
    name: 'Curl piped into a shell',
    severity: 'critical',
    description: 'Downloads remote content and executes it immediately.',
    pattern: /\bcurl\b[^|]*\|\s*(?:sudo\s+|doas\s+)?(?:ba|da|z)?sh\b/i,
  }),
  regexRule({
    id: 'DLE-002',
    name: 'Wget piped into a shell',
    severity: 'critical',
    description: 'Downloads remote content and executes it immediately.',
    pattern: /\bwget\b[^|]*\|\s*(?:sudo\s+|doas\s+)?(?:ba|da|z)?sh\b/i,
  }),
  regexRule({
    id: 'DLE-003',
    name: 'Download then execute',
    severity: 'critical',
    description: 'Downloads a file and makes it executable or runs it in one step.',
    pattern: /\b(?:curl|wget)\b[^\n]*\s(?:--output|-o|-O)\b\s*\S+[^\n]*(?:chmod\s+\+x|(?<![\w./])\.\/)/i,
    scopes: ['any'],
  }),
  regexRule({
    id: 'DLE-004',
    name: 'Download executed via substitution',
    severity: 'critical',
    description:
      'Feeds a curl/wget download straight into eval or a shell via command or process substitution, so the payload never exists as a reviewable file.',
    pattern:
      /\b(?:eval\s+|(?:ba|z|da|k)?sh\s+-c\s+)["']?\$\(\s*(?:curl|wget)\b|\b(?:ba|z|da|k)?sh\s+<\(\s*(?:curl|wget)\b/,
  }),
  regexRule({
    id: 'PASTE-001',
    name: 'Paste-site source URL',
    severity: 'critical',
    description:
      'References a paste/file-drop host; these are commonly used to stage payloads because content is unreviewable and ephemeral.',
    pattern: pasteHostsPattern,
  }),
];

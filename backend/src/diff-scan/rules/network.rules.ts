import { addedLines, isCommentLine, isInScope } from './diff-utils';
import { listRule, regexRule, type Rule } from './rule';

const SHORTENER_HOSTS = ['bit.ly', 'cutt.ly', 'goo.gl', 'is.gd', 'rb.gy', 't.co', 'tinyurl.com'];
const DDNS_HOSTS = ['ddns.net', 'duckdns.org', 'hopto.org', 'no-ip.com', 'no-ip.org', 'serveo.net', 'zapto.org'];

// HaGeZi's DNS blocklists, refreshed on first scan and then memoized.
const SHORTENER_BLOCKLIST_URL =
  'https://raw.githubusercontent.com/hagezi/dns-blocklists/refs/heads/main/dnsmasq/urlshortener.txt';
const DDNS_BLOCKLIST_URL = 'https://raw.githubusercontent.com/hagezi/dns-blocklists/refs/heads/main/dnsmasq/dyndns.txt';

// abuse.ch's live malware-host feed; refreshed on first scan and then memoized.
const MALWARE_HOST_BLOCKLIST_URL = 'https://urlhaus.abuse.ch/downloads/hostfile/';

/** Parses a dnsmasq blocklist ("local=/host/") into the bare host list it blocks. */
export function dnsmasqHosts(raw: string): string[] {
  const hosts: string[] = [];
  for (const line of raw.split('\n')) {
    const match = line.match(/^local=\/([^/]+)\/$/);
    if (match) hosts.push(match[1]);
  }
  return hosts;
}

/** Parses an abuse.ch hosts-file dump ("127.0.0.1 host") into the bare host list it blocks. */
export function hostsFileHosts(raw: string): string[] {
  const hosts: string[] = [];
  for (const line of raw.split('\n')) {
    const match = line.match(/^(?:\d{1,3}\.){3}\d{1,3}\s+(\S+)\s*$/);
    if (match && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(match[1])) hosts.push(match[1]);
  }
  return hosts;
}

/**
 * Turns a bare host into a regex source for `listRule`. Dots are escaped, a
 * lookbehind skips matches mid-label ("notduckdns.org" won't hit "duckdns.org"),
 * and the trailing boundary requires a real URL separator or port colon, so
 * subdomains ("myhost.duckdns.org") and "host:8080" still match.
 */
function hostRegexSource(host: string): string {
  return `(?<![a-z0-9-])${host.replace(/\./g, '\\.')}(?=[/:\\s]|$)`;
}

function hostsFromList(hosts: string[]): string[] {
  return hosts.map(hostRegexSource);
}

const ARCHIVE_PIPE_UPLOAD = /\b(?:tar|zip|7z|gzip)\b[^|;&]*\|\s*(?:curl|wget|nc(?:at)?|socat)\b/i;
/** Upload flags whose payload argument points at user-home or credential material. */
const UPLOAD_FLAG = /\b(?:curl|wget)\b[^\n]*\s(?:--upload-file|-T|-F|--form|--post-file)[=\s]/i;
const SENSITIVE_PAYLOAD =
  /(?:^|[\s"'=@])(?:~|\$\{?HOME\}?)|\/home\/[^\s/"']+|\/root\b|[/"'\s]\.(?:ssh|gnupg|aws|password-store)\b|\/etc\/(?:shadow|gshadow|sudoers)\b/i;

export const NETWORK_RULES: Rule<unknown>[] = [
  regexRule({
    id: 'URL-001',
    name: 'Raw IP address URL',
    severity: 'warning',
    description: 'Downloads from a bare IP address, which bypasses domain-based reputation and review.',
    // Loopback is excluded: http://127.0.0.1 is a local service, not a remote download source.
    pattern: /https?:\/\/(?!127\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
  }),
  listRule({
    id: 'URL-002',
    name: 'URL shortener',
    severity: 'warning',
    description: 'References a URL shortener, which hides the actual download destination.',
    list: hostsFromList(SHORTENER_HOSTS),
    data: {
      url: SHORTENER_BLOCKLIST_URL,
      transform: (raw) => hostsFromList(dnsmasqHosts(raw)),
    },
  }),
  listRule({
    id: 'URL-003',
    name: 'Dynamic-DNS host',
    severity: 'warning',
    description:
      'References a dynamic-DNS hostname, which lets an attacker rotate the backing IP behind a stable name.',
    list: hostsFromList(DDNS_HOSTS),
    data: {
      url: DDNS_BLOCKLIST_URL,
      transform: (raw) => hostsFromList(dnsmasqHosts(raw)),
    },
  }),
  regexRule({
    id: 'URL-004',
    name: 'Punycode host',
    severity: 'warning',
    description: 'Contains an internationalized domain encoded as punycode, commonly used for look-alike domains.',
    pattern: /https?:\/\/(?:[a-z0-9-]+\.)*xn--/i,
  }),
  listRule({
    id: 'URL-005',
    name: 'Known malware host',
    severity: 'critical',
    description: 'Contacts a host that abuse.ch URLhaus currently lists as distributing malware.',
    // Data-only rule: it stays inert until its first successful blocklist load.
    list: [],
    data: {
      url: MALWARE_HOST_BLOCKLIST_URL,
      transform: (raw) => hostsFromList(hostsFileHosts(raw)),
    },
  }),
  regexRule({
    id: 'CAUR-ONION-URL',
    name: 'Tor onion service URL',
    severity: 'critical',
    description:
      'Contacts a Tor hidden service; the 2026 AUR malware campaign used onion services for command and control.',
    pattern: /https?:\/\/[a-z2-7]{16,56}\.onion\b/i,
  }),
  regexRule({
    id: 'EXFIL-003',
    name: 'Chat webhook exfiltration',
    severity: 'critical',
    description:
      'Contains a Discord, Telegram or Slack webhook URL, a common channel for data exfiltration and command delivery.',
    pattern: /discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks|api\.telegram\.org\/bot|hooks\.slack\.com\/services/i,
  }),
  {
    id: 'EXFIL-004',
    name: 'Archive-and-upload exfiltration',
    severity: 'critical',
    description:
      'Streams an archive of local files into a network tool or uploads home-directory material, e.g. tar czf - ~ | curl --data-binary @-, direct bulk data theft.',
    check(change) {
      if (!isInScope(change, ['code'])) return null;
      for (const line of addedLines(change)) {
        if (isCommentLine(line.text)) continue;
        const exfil =
          ARCHIVE_PIPE_UPLOAD.test(line.text) || (UPLOAD_FLAG.test(line.text) && SENSITIVE_PAYLOAD.test(line.text));
        if (exfil) return { line: line.line, match: line.text.trim() };
      }
      return null;
    },
  },
  regexRule({
    id: 'CRYPTO-001',
    name: 'Mining pool connection',
    severity: 'critical',
    description: 'References a mining pool protocol or host, indicating cryptomining activity.',
    pattern: /stratum\+tcp:\/\//i,
  }),
  regexRule({
    id: 'CRYPTO-002',
    name: 'Cryptominer binary',
    severity: 'critical',
    description: 'References a known cryptominer executable.',
    pattern: /\b(?:xmrig|minerd|cpuminer|ethminer)\b/i,
  }),
  regexRule({
    id: 'ENV-001',
    name: 'LD_PRELOAD manipulation',
    severity: 'critical',
    description: 'Sets or uses LD_PRELOAD to inject shared objects into other processes.',
    pattern: /\bLD_PRELOAD\b/,
  }),
  regexRule({
    id: 'ENV-002',
    name: 'PATH overwrite',
    severity: 'warning',
    description: 'Overwrites PATH, which can shadow system binaries like sudo with malicious copies.',
    pattern: /^\s*(?:export\s+)?PATH=/,
  }),
  regexRule({
    id: 'HIDDEN-002',
    name: 'Execution from /tmp',
    severity: 'warning',
    description: 'Writes or executes scripts in world-writable /tmp, where the 2026 campaign staged its payload.',
    pattern: /\/tmp\/[^\s"']+\.(?:sh|py|pl|bin)\b/,
  }),
  regexRule({
    id: 'INSTALL-003',
    name: 'Network access in install scriptlet',
    severity: 'warning',
    description: 'Install scriptlets must not touch the network; downloaded content cannot be verified by pacman.',
    pattern: /\b(?:curl|wget|ncat|nc)\b/,
    scopes: ['install'],
    skipQuoted: true,
  }),
  regexRule({
    id: 'NET-001',
    name: 'Unencrypted HTTP URL',
    severity: 'info',
    description: 'Uses plain HTTP, which allows interception of downloads; prefer HTTPS sources.',
    pattern: /\bhttp:\/\//,
    scopes: ['pkgbuild'],
  }),
];

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

/** Upload flags whose payload argument points at user-home or credential material. */
const UPLOAD_FLAG = /\b(?:curl|wget)\b[^\n]*\s(?:--upload-file|-T|-F|--form|--post-file)[=\s]/i;
const SENSITIVE_PAYLOAD =
  /(?:^|[\s"'=@])(?:~|\$\{?HOME\}?)|\/home\/[^\s/"']+|\/root\b|[/"'\s]\.(?:ssh|gnupg|aws|password-store)\b|\/etc\/(?:shadow|gshadow|sudoers)\b/i;

/** Single-file tools piping straight to a network tool; only suspicious when the file is sensitive. */
const FILE_PIPE_UPLOAD = /\b(?:cat|cp|dd|gpg|rsync)\b[^|;&]*\|\s*(?:curl|wget|nc(?:at)?|socat)\b/i;
const ARCHIVE_PIPE_UPLOAD = /\b(?:tar|zip|7z|gzip)\b[^|;&]*\|\s*(?:curl|wget|nc(?:at)?|socat)\b/i;

export const NETWORK_RULES: Rule<unknown>[] = [
  regexRule({
    id: 'URL-001',
    name: 'Raw IP address URL',
    severity: 'warning',
    description:
      'Downloads from a bare IP address (dotted, hex, integer or IPv6 literal), which bypasses domain-based reputation and review.',
    // Loopback is excluded: http://127.0.0.1 is a local service, not a remote download source.
    pattern:
      /https?:\/\/(?:(?!127\.)(?:\d{1,3}\.){3}\d{1,3}(?=[:/\s"')]|$)|\[(?!::1])[0-9a-f:]+]|0x[0-9a-f]{6,8}\b|\d{8,10}(?=[:/\s"')]|$))/i,
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
      cacheKey: 'urlshortener-blocklist',
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
      cacheKey: 'dyndns-blocklist',
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
    // Data-only rule: it stays inert until its first successful blocklist load;
    // the last good payload is persisted and reused while the feed is unreachable.
    list: [],
    data: {
      url: MALWARE_HOST_BLOCKLIST_URL,
      transform: (raw) => hostsFromList(hostsFileHosts(raw)),
      cacheKey: 'urlhaus-hosts',
    },
  }),
  regexRule({
    id: 'CAUR-ONION-URL',
    name: 'Tor onion service URL',
    severity: 'critical',
    description:
      'Contacts a Tor hidden service; the 2026 AUR malware campaign used onion services for command and control.',
    pattern: /\b[a-z2-7]{16,56}\.onion\b/i,
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
        const sensitive = SENSITIVE_PAYLOAD.test(line.text);
        const exfil =
          ARCHIVE_PIPE_UPLOAD.test(line.text) ||
          (FILE_PIPE_UPLOAD.test(line.text) && sensitive) ||
          (UPLOAD_FLAG.test(line.text) && sensitive);
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
    pattern: /\bstratum\+(?:tcp|ssl|udp):\/\//i,
  }),
  regexRule({
    id: 'CRYPTO-002',
    name: 'Cryptominer binary reference',
    severity: 'warning',
    description:
      'References a known cryptominer executable. Miner packages legitimately install their own binaries, so this alone is a warning; mining activity is confirmed by a pool URL or wallet address.',
    pattern: /\b(?:xmrig|minerd|cpuminer|ethminer|xmr-stak|nbminer|srbminer|teamredminer|t-rex|wildrig)\b/i,
  }),
  regexRule({
    id: 'CAUR-MONERO-WALLET',
    name: 'Monero wallet address',
    severity: 'critical',
    description: 'Contains a Monero payment address, indicating mining payouts or ransom demands.',
    // Base58 alphabet (no 0, O, I, l); standard addresses start with 4, subaddresses with 8.
    pattern: /\b[48][1-9A-HJ-NP-Za-km-z]{94}\b/,
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
    description:
      'Overwrites PATH, which can shadow system binaries like sudo with malicious copies; build-time adjustments pointing at $pkgdir are expected packaging practice.',
    pattern: /^\s*(?:export\s+)?PATH=(?!.*\$\{?pkgdir}?)/,
  }),
  regexRule({
    id: 'HIDDEN-002',
    name: 'Execution from world-writable directory',
    severity: 'warning',
    description:
      'Writes or executes scripts in world-writable /tmp, /var/tmp or /dev/shm or hidden staging paths, where the 2026 campaign staged its payload.',
    pattern: /\/(?:tmp|var\/tmp|dev\/shm)\/[^\s"']*\.(?:sh|py|pl|bin)\b|\/(?:tmp|var\/tmp|dev\/shm)\/\.[^\s"']+/,
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

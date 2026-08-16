import { type DiffScanRule, regexRule } from './rule';

const SHORTENER_HOSTS = ['bit.ly', 'cutt.ly', 'goo.gl', 'is.gd', 'rb.gy', 't.co', 'tinyurl.com'];
const DDNS_HOSTS = ['ddns.net', 'duckdns.org', 'hopto.org', 'no-ip.com', 'no-ip.org', 'serveo.net', 'zapto.org'];

function hostAlternation(hosts: string[]): string {
  return hosts.join('|').replace(/\./g, '\\.');
}

export const NETWORK_RULES: DiffScanRule[] = [
  regexRule({
    id: 'URL-001',
    name: 'Raw IP address URL',
    severity: 'warning',
    description: 'Downloads from a bare IP address, which bypasses domain-based reputation and review.',
    // Loopback is excluded: http://127.0.0.1 is a local service, not a remote download source.
    pattern: /https?:\/\/(?!127\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
  }),
  regexRule({
    id: 'URL-002',
    name: 'URL shortener',
    severity: 'warning',
    description: 'References a URL shortener, which hides the actual download destination.',
    pattern: new RegExp(`(?:[\\w-]+\\.)*(?:${hostAlternation(SHORTENER_HOSTS)})(?:/|\\s|$)`, 'i'),
  }),
  regexRule({
    id: 'URL-003',
    name: 'Dynamic-DNS host',
    severity: 'warning',
    description:
      'References a dynamic-DNS hostname, which lets an attacker rotate the backing IP behind a stable name.',
    pattern: new RegExp(`(?:[\\w-]+\\.)*(?:${hostAlternation(DDNS_HOSTS)})(?:/|\\s|$)`, 'i'),
  }),
  regexRule({
    id: 'URL-004',
    name: 'Punycode host',
    severity: 'warning',
    description: 'Contains an internationalized domain encoded as punycode, commonly used for look-alike domains.',
    pattern: /https?:\/\/(?:[a-z0-9-]+\.)*xn--/i,
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

import { regexRule, type Rule } from './rule';

export const CREDENTIAL_RULES: Rule[] = [
  regexRule({
    id: 'CRED-001',
    name: 'SSH key access',
    severity: 'critical',
    description: 'Touches SSH key material.',
    pattern: /\.ssh\b|\bid_(?:rsa|ed25519|ecdsa)\b|authorized_keys/,
    scopes: ['code'],
  }),
  regexRule({
    id: 'CRED-002',
    name: 'GPG key access',
    severity: 'critical',
    description: 'Touches GnuPG private key storage.',
    pattern: /\.gnupg\b|private-keys-v1\.d|secring\.gpg/,
    scopes: ['code'],
  }),
  regexRule({
    id: 'CRED-003',
    name: 'Secret file access',
    severity: 'critical',
    description: 'Reads password hashes, cloud credentials or service host tokens.',
    pattern: /\/etc\/shadow|\.netrc\b|\.aws\/credentials|\.config\/gh\/hosts|\.git-credentials|\.docker\/config\.json/,
    scopes: ['code'],
  }),
  regexRule({
    id: 'BROWSER-001',
    name: 'Browser profile access',
    severity: 'critical',
    description: 'Touches browser profile directories with saved logins and cookies.',
    // The path separator guard keeps hostnames like archive.mozilla.org out.
    pattern: /[/~]\.mozilla\b|\.config\/(?:google-chrome|chromium|BraveSoftware)|[/~]\.librewolf\b/,
    scopes: ['code'],
  }),
  regexRule({
    id: 'BROWSER-002',
    name: 'Browser credential database access',
    severity: 'critical',
    description: 'Touches browser databases with saved logins and cookies.',
    pattern: /logins\.json|cookies\.sqlite|Login Data|key4\.db|Web Data/,
    scopes: ['code'],
  }),
  regexRule({
    id: 'WALLET-001',
    name: 'Crypto wallet access',
    severity: 'critical',
    description: 'Touches cryptocurrency wallet storage or key files.',
    pattern: /\.electrum\b|wallet\.dat|\.config\/Exodus|\.ethereum\b|\.bitcoin\b/,
    scopes: ['code'],
  }),
];

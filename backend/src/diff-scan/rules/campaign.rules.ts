import { addedLines, isInScope, removedLineTexts } from './diff-utils';
import type { DiffScanRule } from './rule';
import { regexRule } from './rule';

/** Flags between the subcommand and the package name, e.g. "npm install -g pkg". */
const PACKAGE_FLAGS = '(?:-{1,2}[\\w-]+\\s+)*';
const NPM_INSTALL_WITH_PACKAGE = new RegExp(
  `\\b(?:npm|bun|pnpm|yarn)\\s+(?:install|i|add)\\s+${PACKAGE_FLAGS}[^\\s\\\\-]` +
    `|\\b(?:npx|bunx)\\s+${PACKAGE_FLAGS}[^\\s\\\\-]` +
    `|\\b(?:pnpm|yarn)\\s+dlx\\s+${PACKAGE_FLAGS}[^\\s\\\\-]`,
);
const CAMPAIGN_ACCOUNTS = [
  'annikkitikkanen',
  'catringiess',
  'custodiatovar',
  'dominikgross',
  'fardewoak',
  'herbsobering',
  'krisztinavarga',
  'laurentbavaud',
  'meryemplath',
  'plyshka',
  'skarbricat',
  'veramagalhaes',
  'vitoriapires',
  'zsomborzabo',
];

const MAINTAINER_LINE = /^#\s*(?:Maintainer|Contributor):\s*([^<]+?)\s*<([^>]+)>/;
const CAMPAIGN_EMAIL = new RegExp(`\\b(?:${CAMPAIGN_ACCOUNTS.join('|')})@`, 'i');

function maintainerIdentity(text: string): { name: string; email: string } | null {
  const match = text.match(MAINTAINER_LINE);
  if (!match) return null;
  return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
}

function identitiesByPerson(lines: string[]): Map<string, Set<string>> {
  const identities = new Map<string, Set<string>>();
  for (const line of lines) {
    const identity = maintainerIdentity(line);
    if (!identity) continue;
    identities.set(identity.name, (identities.get(identity.name) ?? new Set<string>()).add(identity.email));
  }
  return identities;
}

export const CAMPAIGN_RULES: DiffScanRule[] = [
  regexRule({
    id: 'NPM-001',
    name: 'Package manager fetch at build/install time',
    severity: 'critical',
    description: 'Installs or executes a named npm/bun/pnpm/yarn package during build or installation.',
    pattern: NPM_INSTALL_WITH_PACKAGE,
    scopes: ['pkgbuild', 'install'],
  }),
  regexRule({
    id: 'NPM-002',
    name: 'Known malicious package',
    severity: 'critical',
    description: 'References a package known from campaigns.',
    pattern: /\b(?:atomic-lockfile|lockfile-js|js-digest)\b/,
  }),
  regexRule({
    id: 'CAUR-NPM-CACHE',
    name: 'User cache directory access',
    severity: 'info',
    description: 'Touches npm/bun user cache directories, build tools should keep caches inside the build environment.',
    pattern: /\.npm\/_cacache|\.bun\/install\/cache|~\/\.npm\b|~\/\.bun\b/,
  }),
  {
    id: 'CAUR-IDENTITY-SWAP',
    name: 'Maintainer email swapped',
    severity: 'warning',
    description:
      'Replaces the email address of an existing maintainer or contributor while keeping their name. Update MRs rarely change packager identities.',
    check(change) {
      if (!isInScope(change, ['pkgbuild'])) return null;
      const previous = identitiesByPerson(removedLineTexts(change));
      if (previous.size === 0) return null;

      for (const line of addedLines(change)) {
        const identity = maintainerIdentity(line.text);
        if (!identity) continue;
        const oldEmails = previous.get(identity.name);
        if (oldEmails && !oldEmails.has(identity.email)) {
          return { line: line.line, match: line.text.trim(), note: `Email of ${identity.name} changed` };
        }
      }
      return null;
    },
  },
  {
    id: 'CAUR-CAMPAIGN-ACCOUNT',
    name: 'Known campaign account',
    severity: 'critical',
    description:
      'References an account or email observed previous malware campaigns, which impersonated existing maintainers to take over packages.',
    check(change) {
      if (!isInScope(change, ['pkgbuild', 'install'])) return null;
      const hit = addedLines(change).find((line) => CAMPAIGN_EMAIL.test(line.text));
      return hit ? { line: hit.line, match: hit.text.trim() } : null;
    },
  },
];

import { addedLines, isInScope, removedLineTexts } from './diff-utils';
import { regexRule, type Rule } from './rule';

/** Flags between the subcommand and the package name, for example "npm install -g pkg". */
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

/** Lockfile-pinned or offline invocations fetch nothing the reviewer cannot see. */
const PINNED_INVOCATION = /--frozen-lockfile|--offline|\bnpm\s+ci\b|file:\/\//;
/** Staging installs target the build sandbox or package dir, not the user system. */
const STAGING_TARGET = /\$?\{?(?:pkgdir|srcdir)\}?|(?:-C|--dir)\s+\.{1,2}\//;

export const CAMPAIGN_RULES: Rule[] = [
  regexRule({
    id: 'NPM-001',
    name: 'Package manager fetch at build/install time',
    severity: 'critical',
    description: 'Installs or executes a named npm/bun/pnpm/yarn package during build or installation.',
    pattern: NPM_INSTALL_WITH_PACKAGE,
    scopes: ['pkgbuild', 'install'],
    classify(line) {
      // Direct global/named fetches stay critical. Pinned or staging-only
      // invocations fetch nothing unpinned at user expense.
      if (PINNED_INVOCATION.test(line) || STAGING_TARGET.test(line)) {
        return { severity: 'warning', note: 'Lockfile-pinned or build-staging invocation' };
      }
      return undefined;
    },
  }),
  regexRule({
    id: 'NPM-002',
    name: 'Known malicious package',
    severity: 'critical',
    description: 'References a package known from campaigns.',
    pattern: /\b(?:atomic-lockfile|lockfile-js|js-digest)\b/,
  }),
  regexRule({
    id: 'CAUR-NODE-EVAL',
    name: 'Inline Node.js evaluation',
    severity: 'critical',
    description: 'Executes inline JavaScript during build or installation.',
    pattern: /\bnode\s+(?:--(?:eval|print)|-[ep]\b|-pe\b)/,
    scopes: ['pkgbuild', 'install'],
  }),
  regexRule({
    id: 'CAUR-NODE-CHILD-PROCESS',
    name: 'Node child_process usage',
    severity: 'critical',
    description: 'Inline JavaScript spawning processes during build or installation.',
    pattern: /\bchild_process\b|\bexecSync\(|\bspawnSync\(/,
    scopes: ['pkgbuild', 'install'],
  }),
  regexRule({
    id: 'CAUR-DENO-FETCH',
    name: 'Deno script execution',
    severity: 'critical',
    description: 'Fetches and runs Deno code at build or install time.',
    pattern: /\bdeno\s+(?:install|run|eval)\b/,
    scopes: ['pkgbuild', 'install'],
  }),
  regexRule({
    id: 'CAUR-NPM-CACHE',
    name: 'User cache directory access',
    severity: 'info',
    description: 'Touches npm/bun user cache directories.',
    pattern: /\.npm\/_cacache|\.bun\/install\/cache|~\/\.npm\b|~\/\.bun\b/,
  }),
  {
    id: 'CAUR-IDENTITY-SWAP',
    name: 'Maintainer email swapped',
    severity: 'warning',
    runsOn: ['mr-diff'],
    description: 'Replaces the email address of an existing maintainer or contributor while keeping their name.',
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
    description: 'References an account or email observed in previous malware campaigns.',
    check(change) {
      if (!isInScope(change, ['pkgbuild', 'install'])) return null;
      const hit = addedLines(change).find((line) => CAMPAIGN_EMAIL.test(line.text));
      return hit ? { line: hit.line, match: hit.text.trim() } : null;
    },
  },
];

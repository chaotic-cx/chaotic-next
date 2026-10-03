// Compares the translation keys used in the frontend with the translation files.
//
// transloco-keys-manager extracts the keys. Its `find` command maps a TypeScript key
// to a scope only through a third `translate()` argument, but this code base uses
// full keys (`admin.packages.title`) everywhere. So this script runs `extract` and
// moves every global key whose first segment is a scope alias into that scope.
//
// Each translation must also keep the `{{params}}` and HTML tags of the source text.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TRANSLATIONS_DIR = 'frontend/public/i18n';
const SOURCE_LANGUAGE = 'en';
const LANGUAGES = [SOURCE_LANGUAGE, 'de'];
const PARAM_PATTERN = /{{\s*(\w+)\s*}}/g;
const TAG_PATTERN = /<\/?([a-z][a-z0-9]*)/gi;
const GLOBAL_SCOPE = '';

function flatten(object, prefix = '') {
  const result = {};

  for (const [key, value] of Object.entries(object)) {
    const fullKey = prefix === '' ? key : `${prefix}.${key}`;
    if (value !== null && typeof value === 'object') {
      Object.assign(result, flatten(value, fullKey));
      continue;
    }

    result[fullKey] = value;
  }

  return result;
}

function readTranslation(file) {
  if (!existsSync(file)) {
    return {};
  }

  return flatten(JSON.parse(readFileSync(file, 'utf8')));
}

function readKeys(file) {
  return new Set(Object.keys(readTranslation(file)));
}

/**
 * The params and HTML tags of a text, sorted, as one comparable string.
 * Their order can change in a translation, their set cannot.
 */
function markupSignature(text) {
  const parts = [];

  for (const match of String(text).matchAll(PARAM_PATTERN)) {
    parts.push(`{{${match[1]}}}`);
  }

  for (const match of String(text).matchAll(TAG_PATTERN)) {
    parts.push(match[0].toLowerCase());
  }

  return parts.sort().join(' ');
}

function markupMismatches(sourceFile, translatedFile) {
  const source = readTranslation(sourceFile);
  const translated = readTranslation(translatedFile);
  const mismatches = [];

  for (const [key, text] of Object.entries(translated)) {
    if (!(key in source)) {
      continue;
    }

    const expected = markupSignature(source[key]);
    const actual = markupSignature(text);
    if (expected !== actual) {
      mismatches.push(`${key} (expected "${expected}", found "${actual}")`);
    }
  }

  return mismatches.sort();
}

function scopeAlias(scope) {
  return scope.replace(/-(\w)/g, (match, letter) => letter.toUpperCase());
}

function listScopes(directory) {
  const scopes = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      scopes.push(entry.name);
    }
  }

  return scopes;
}

function translationFile(directory, scope, language) {
  if (scope === GLOBAL_SCOPE) {
    return path.join(directory, `${language}.json`);
  }

  return path.join(directory, scope, `${language}.json`);
}

function extractUsedKeys(outputDir) {
  execFileSync('transloco-keys-manager', ['extract', '--project', 'frontend', '-o', outputDir, '-l', 'en', '-r'], {
    stdio: 'ignore',
  });
}

/**
 * Groups the extracted keys by scope.
 * Global keys that start with a scope alias move into that scope, without the alias.
 */
function usedKeysByScope(outputDir) {
  const scopes = listScopes(outputDir);
  const byScope = new Map([[GLOBAL_SCOPE, new Set()]]);
  const scopeByAlias = new Map();

  for (const scope of scopes) {
    byScope.set(scope, readKeys(translationFile(outputDir, scope, 'en')));
    scopeByAlias.set(scopeAlias(scope), scope);
  }

  for (const key of readKeys(translationFile(outputDir, GLOBAL_SCOPE, 'en'))) {
    const [firstSegment, ...rest] = key.split('.');
    const scope = scopeByAlias.get(firstSegment);
    if (scope === undefined) {
      byScope.get(GLOBAL_SCOPE).add(key);
      continue;
    }

    byScope.get(scope).add(rest.join('.'));
  }

  return byScope;
}

function difference(left, right) {
  return [...left].filter((key) => !right.has(key)).sort();
}

function report(label, file, keys) {
  if (keys.length === 0) {
    return;
  }

  console.error(`${label} in ${file}:`);
  for (const key of keys) {
    console.error(`  ${key}`);
  }
}

const outputDir = mkdtempSync(path.join(tmpdir(), 'i18n-check-'));
let problems = 0;

try {
  extractUsedKeys(outputDir);

  for (const [scope, used] of usedKeysByScope(outputDir)) {
    for (const language of LANGUAGES) {
      const file = translationFile(TRANSLATIONS_DIR, scope, language);
      const defined = readKeys(file);
      const missing = difference(used, defined);
      const unused = difference(defined, used);

      report('Missing keys', file, missing);
      report('Unused keys', file, unused);
      problems += missing.length + unused.length;

      if (language === SOURCE_LANGUAGE) {
        continue;
      }

      const mismatches = markupMismatches(translationFile(TRANSLATIONS_DIR, scope, SOURCE_LANGUAGE), file);
      report('Params or HTML tags differ from the source text', file, mismatches);
      problems += mismatches.length;
    }
  }
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}

if (problems > 0) {
  console.error(`\n${problems} translation key problem(s) found.`);
  process.exit(1);
}

console.log('All translation keys are defined and used.');

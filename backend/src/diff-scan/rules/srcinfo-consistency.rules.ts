import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import { substituteVars } from '../pkgbuild';
import { addedLines, basename, dirname } from './diff-utils';
import type { GroupRuleHit, Rule } from './rule';

const PKGBUILD_FILE = 'PKGBUILD';
const SRCINFO_FILE = '.SRCINFO';

const SCALAR_VARS = ['pkgver', 'pkgrel', 'pkgdesc', 'url'] as const;
const LIST_VARS = [
  'arch',
  'license',
  'depends',
  'makedepends',
  'checkdepends',
  'provides',
  'conflicts',
  'replaces',
] as const;

const TOP_LEVEL_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)(\+?)=\s*(.*)$/;
const FUNCTION_DEFINITION = /^\w[\w.+-]*\s*\(\)/;
// .SRCINFO indents every key below its section header with a tab.
const SRCINFO_KEY_VALUE = /^\s*([A-Za-z0-9_.]+)\s*=\s*(.*)$/;

interface PkgbuildContent {
  scalars: Map<string, string>;
  lists: Map<string, string[]>;
}

interface SrcinfoEntry {
  values: string[];
  line: number;
  text: string;
}

/**
 * Compares the committed .SRCINFO against the PKGBUILD it claims to be
 * generated from and reports every variable that drifted apart. Only the
 * pkgbase section is compared; per-package sections may legitimately override
 * inherited variables in split packages.
 */
export const SRCINFO_CONSISTENCY_RULES: Rule[] = [
  {
    id: 'CAUR-SRCINFO-MISMATCH',
    name: '.SRCINFO does not match the PKGBUILD',
    severity: 'warning',
    description:
      'The committed .SRCINFO disagrees with the PKGBUILD it is generated from, so the metadata pacman and the AUR display is wrong. Regenerate it with makepkg --printsrcinfo > .SRCINFO.',
    runsOn: ['full-file'],
    check: () => null,
    checkGroup: srcinfoConsistencyHits,
  },
];

export function srcinfoConsistencyHits(changes: MergeRequestDiffSchema[]): GroupRuleHit[] {
  const live = changes.filter((change) => !change.deleted_file);
  const directories = new Set(live.map((change) => dirname(change.new_path)));
  const hits: GroupRuleHit[] = [];

  for (const directory of directories) {
    const pkgChange = changeNamed(live, directory, PKGBUILD_FILE);
    const srcChange = changeNamed(live, directory, SRCINFO_FILE);
    if (!pkgChange || !srcChange) continue;

    const content = parsePkgbuildContent(fileLines(pkgChange));
    const srcinfoBase = parseSrcinfoBaseSection(fileLines(srcChange));
    hits.push(...compareWithSrcinfo(srcChange.new_path, content, srcinfoBase));
  }
  return hits;
}

function fileLines(change: MergeRequestDiffSchema): string[] {
  return addedLines(change).map((line) => line.text);
}

function changeNamed(
  changes: MergeRequestDiffSchema[],
  directory: string,
  fileName: string,
): MergeRequestDiffSchema | undefined {
  return changes.find((change) => dirname(change.new_path) === directory && basename(change.new_path) === fileName);
}

function parsePkgbuildContent(lines: string[]): PkgbuildContent {
  const scalars = new Map<string, string>();
  const lists = new Map<string, string[]>();
  let openArray: { name: string; appended: boolean } | null = null;
  let buffer: string[] = [];

  for (const text of lines) {
    if (openArray !== null) {
      buffer.push(...splitArrayValues(text));
      if (!text.includes(')')) continue;
      assignList(lists, openArray.name, buffer, openArray.appended);
      openArray = null;
      buffer = [];
      continue;
    }
    if (FUNCTION_DEFINITION.test(text)) break;

    const assignment = text.match(TOP_LEVEL_ASSIGNMENT);
    if (!assignment) continue;
    const [, name, append, rawValue] = assignment;
    const value = rawValue.trim();

    if (value.includes('(')) {
      const inside = value.slice(value.indexOf('(') + 1);
      const closing = inside.lastIndexOf(')');
      if (closing === -1) {
        openArray = { name, appended: append === '+' };
        buffer = splitArrayValues(inside);
      } else {
        assignList(lists, name, splitArrayValues(inside.slice(0, closing)), append === '+');
      }
    } else if (value !== '') {
      scalars.set(name, unquote(value));
    }
  }
  return { scalars, lists };
}

function assignList(lists: Map<string, string[]>, name: string, values: string[], appended: boolean): void {
  const merged = appended ? [...(lists.get(name) ?? []), ...values] : values;
  lists.set(name, merged);
}

function splitArrayValues(text: string): string[] {
  return text
    .replace(/\)\s*$/, '')
    .split(/\s+/)
    .filter((entry) => entry.length > 0)
    .map(unquote);
}

function unquote(value: string): string {
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.endsWith(quote) ? value.slice(1, -1) : value;
}

function parseSrcinfoBaseSection(lines: string[]): Map<string, SrcinfoEntry> {
  const base = new Map<string, SrcinfoEntry>();
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index]?.match(SRCINFO_KEY_VALUE);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (key === 'pkgname') break;

    const value = rawValue.trim();
    const entry = base.get(key);
    if (entry) entry.values.push(value);
    else base.set(key, { values: [value], line: index + 1, text: lines[index] ?? '' });
  }
  return base;
}

function compareWithSrcinfo(
  srcPath: string,
  content: PkgbuildContent,
  srcinfo: Map<string, SrcinfoEntry>,
): GroupRuleHit[] {
  const hits: GroupRuleHit[] = [];

  for (const name of SCALAR_VARS) {
    const declared = content.scalars.get(name);
    const generated = srcinfo.get(name)?.values[0];
    if ((declared ?? '') === (generated ?? '')) continue;
    hits.push(mismatchHit(srcPath, srcinfo.get(name), name, declared, generated));
  }

  for (const name of LIST_VARS) {
    const rawList = content.lists.get(name);
    if (rawList === undefined) continue;
    const declared = resolveList(rawList, content.scalars);
    // Unresolvable references cannot be judged statically; stay silent.
    if (declared === null) continue;
    const generated = srcinfo.get(name)?.values ?? [];
    if (sameSet(declared, generated)) continue;
    hits.push(mismatchHit(srcPath, srcinfo.get(name), name, declared, generated));
  }
  return hits;
}

function resolveList(values: string[], scalars: ReadonlyMap<string, string>): string[] | null {
  const resolved: string[] = [];
  for (const value of values) {
    const expanded = substituteVars(value, scalars);
    if (expanded === null) return null;
    if (expanded !== '') resolved.push(expanded);
  }
  return resolved;
}

function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function mismatchHit(
  srcPath: string,
  entry: SrcinfoEntry | undefined,
  variable: string,
  declared: string | string[] | undefined,
  generated: string | string[] | undefined,
): GroupRuleHit {
  return {
    file: srcPath,
    line: entry?.line ?? 1,
    match: entry?.text ?? `${variable} (missing in .SRCINFO)`,
    note: `'${variable}': PKGBUILD declares ${render(declared)} but .SRCINFO declares ${render(generated)}`,
  };
}

function render(value: string | string[] | undefined): string {
  if (value === undefined) return '(nothing)';
  return typeof value === 'string' ? `"${value}"` : `[${value.join(', ')}]`;
}

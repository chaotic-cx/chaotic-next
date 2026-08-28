import {
  DEFAULT_VALUE_ASSIGNMENT,
  FUNCTION_BODY_END,
  FUNCTION_DEFINITION,
  SHELL_BLOCK_END,
  SHELL_BLOCK_START,
  stripInlineComment,
  substituteVars,
  unquote,
} from '../pkgbuild';
import { addedLines, basename, dirname } from './diff-utils';
import { type GroupRuleHit, type Rule } from './rule';
import { type MergeRequestDiffSchema } from '@gitbeaker/core';

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

/**
 * List variables whose order is meaningful, so they are compared as sequences
 * after resolving variables and expanding brace alternations. `source` leads
 * here because a stale .SRCINFO hides changed download locations from pacman.
 */
const SEQUENCE_VARS = ['source'] as const;

const TOP_LEVEL_ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)(\+?)=\s*(.*)$/;
// .SRCINFO indents every key below its section header with a tab.
const SRCINFO_KEY_VALUE = /^\s*([A-Za-z0-9_.]+)\s*=\s*(.*)$/;

interface PkgbuildContent {
  scalars: Map<string, string>;
  lists: Map<string, string[]>;
  /** Variables that receive assignments inside if/for/case blocks; their final value is not statically known. */
  conditionalNames: Set<string>;
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
  const conditionalNames = new Set<string>();
  let openArray: { name: string; appended: boolean } | null = null;
  let buffer: string[] = [];
  let blockDepth = 0;
  let insideFunction = false;

  for (const rawLine of lines) {
    if (insideFunction) {
      if (FUNCTION_BODY_END.test(rawLine)) insideFunction = false;
      continue;
    }
    const text = stripInlineComment(rawLine);

    if (FUNCTION_DEFINITION.test(text)) {
      insideFunction = true;
      continue;
    }

    if (openArray !== null) {
      buffer.push(...splitArrayValues(text));
      if (!text.includes(')')) continue;
      assignList(lists, openArray.name, buffer, openArray.appended);
      markConditional(conditionalNames, blockDepth > 0, openArray.name);
      openArray = null;
      buffer = [];
      continue;
    }

    if (SHELL_BLOCK_START.test(text)) {
      blockDepth++;
      continue;
    }
    if (SHELL_BLOCK_END.test(text)) {
      blockDepth = Math.max(blockDepth - 1, 0);
      continue;
    }

    const defaulted = text.match(DEFAULT_VALUE_ASSIGNMENT);
    if (defaulted?.[1] !== undefined && defaulted[2] !== undefined) {
      scalars.set(defaulted[1], unquote(defaulted[2].trim()));
      continue;
    }

    const assignment = text.match(TOP_LEVEL_ASSIGNMENT);
    if (!assignment) continue;
    const [, name, append, rawValue] = assignment;
    const value = rawValue.trim();

    if (value.startsWith('(')) {
      const inside = value.slice(value.indexOf('(') + 1);
      const closing = inside.lastIndexOf(')');
      if (closing === -1) {
        openArray = { name, appended: append === '+' };
        buffer = splitArrayValues(inside);
      } else {
        assignList(lists, name, splitArrayValues(inside.slice(0, closing)), append === '+');
        markConditional(conditionalNames, blockDepth > 0, name);
      }
    } else if (value !== '') {
      scalars.set(name, unquote(value));
      markConditional(conditionalNames, blockDepth > 0, name);
    }
  }
  return { scalars, lists, conditionalNames };
}

function markConditional(conditionalNames: Set<string>, conditional: boolean, name: string): void {
  if (conditional) conditionalNames.add(name);
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
    if (content.conditionalNames.has(name)) continue;
    const declaredRaw = content.scalars.get(name);
    const generated = srcinfo.get(name)?.values[0];
    if (declaredRaw === undefined) {
      if (generated === undefined) continue;
      hits.push(mismatchHit(srcPath, srcinfo.get(name), name, undefined, generated));
      continue;
    }
    const declared = substituteVars(declaredRaw, content.scalars);
    // Unresolvable references cannot be judged statically; stay silent.
    if (declared === null) continue;
    if (declared === (generated ?? '')) continue;
    hits.push(mismatchHit(srcPath, srcinfo.get(name), name, declared, generated));
  }

  for (const name of LIST_VARS) {
    if (content.conditionalNames.has(name)) continue;
    const rawList = content.lists.get(name);
    if (rawList === undefined) continue;
    const declared = resolveList(rawList, content.scalars);
    // Unresolvable references cannot be judged statically; stay silent.
    if (declared === null) continue;
    const generated = srcinfo.get(name)?.values ?? [];
    if (sameSet(declared, generated)) continue;
    hits.push(mismatchHit(srcPath, srcinfo.get(name), name, declared, generated));
  }

  for (const name of SEQUENCE_VARS) {
    if (content.conditionalNames.has(name)) continue;
    const rawList = content.lists.get(name);
    if (rawList === undefined) continue;
    const resolved = resolveList(rawList, content.scalars);

    // Unresolvable references cannot be judged statically; stay silent.
    if (resolved === null) continue;

    const declared = resolved.flatMap(expandBraces).map(normalizeSourceValue);
    const generated = (srcinfo.get(name)?.values ?? []).map(normalizeSourceValue);
    if (sameSequence(declared, generated)) continue;
    hits.push(mismatchHit(srcPath, srcinfo.get(name), name, declared, generated));
  }
  return hits;
}

/**
 * Expands single-level brace alternations like `tarball{,.asc}` the way bash
 * does before makepkg sees the array. Nested or range braces stay literal.
 */
function expandBraces(value: string): string[] {
  const open = value.indexOf('{');
  if (open === -1) return [value];
  const close = value.indexOf('}', open);
  if (close === -1) return [value];
  const prefix = value.slice(0, open);
  const suffix = value.slice(close + 1);
  return value
    .slice(open + 1, close)
    .split(',')
    .flatMap((option) => expandBraces(prefix + option + suffix));
}

/** Source entries may carry interior quoting around renames ("file"::"url"); .SRCINFO never does. */
function normalizeSourceValue(value: string): string {
  return value.replace(/["']/g, '').trim();
}

function sameSequence(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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

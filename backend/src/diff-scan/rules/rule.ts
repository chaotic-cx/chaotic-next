import type { DiffScanSeverity } from '@chaotic-next/shared-lib';
import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import { addedLines, deobfuscateLine, isCommentLine, isInScope, type RuleScope } from './diff-utils';

export interface RuleHit {
  line?: number;
  match: string;
  note?: string;
  severity?: DiffScanSeverity;
}

export interface DiffScanRule {
  id: string;
  name: string;
  severity: DiffScanSeverity;
  description: string;
  check(change: MergeRequestDiffSchema): RuleHit | null;
}

export interface RegexRuleOptions {
  id: string;
  name: string;
  severity: DiffScanSeverity;
  description: string;
  pattern: RegExp;
  scopes?: RuleScope[];
  scanComments?: boolean;
  /** Skip matches inside quoted strings (e.g. install scriptlet "sudo …" messages). Only raw matches are affected. */
  skipQuoted?: boolean;
  /** Match the raw line only, for rules that detect the obfuscation itself. */
  rawOnly?: boolean;
}

export function regexRule(options: RegexRuleOptions): DiffScanRule {
  return {
    id: options.id,
    name: options.name,
    severity: options.severity,
    description: options.description,
    check(change) {
      if (!isInScope(change, options.scopes ?? ['any'])) return null;
      for (const line of addedLines(change)) {
        if (!options.scanComments && isCommentLine(line.text)) continue;
        const rawMatch = line.text.match(options.pattern);
        const rawHit =
          rawMatch !== null && !(options.skipQuoted && isInsideQuotedString(line.text, rawMatch.index ?? 0));
        const deobfuscatedHit =
          !rawHit && !options.rawOnly && !options.skipQuoted && matchesDeobfuscated(line.text, options.pattern);
        if (rawHit || deobfuscatedHit) {
          return { line: line.line, match: line.text.trim() };
        }
      }
      return null;
    },
  };
}

function matchesDeobfuscated(text: string, pattern: RegExp): boolean {
  const deobfuscated = deobfuscateLine(text);
  return deobfuscated !== text && deobfuscated.match(pattern) !== null;
}

function isInsideQuotedString(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const doubleQuotes = before.match(/(?<!\\)"/g)?.length ?? 0;
  const singleQuotes = before.match(/(?<!\\)'/g)?.length ?? 0;
  return doubleQuotes % 2 === 1 || singleQuotes % 2 === 1;
}

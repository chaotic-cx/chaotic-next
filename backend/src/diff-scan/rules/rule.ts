import type { DiffScanSeverity } from '@chaotic-next/shared-lib';
import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import { addedLines, deobfuscateLine, isCommentLine, isInScope, type RuleScope } from './diff-utils';
import { ruleDataStore } from './rule-data-store';

const RULE_DATA_TIMEOUT_MS = 15_000;

export interface RuleHit {
  line?: number;
  match: string;
  note?: string;
  severity?: DiffScanSeverity;
}

/** Hit of a cross-file check, which must name the file it points at. */
export type GroupRuleHit = RuleHit & { file: string };

/** Where a rule makes sense: MR changesets compare old vs new; full-file scans see only content. */
export type RuleSurface = 'mr-diff' | 'full-file';

export interface RuleDataLoader<T> {
  url: string;
  transform: (raw: string) => T;
  /** Stable key under which the last successfully downloaded payload is persisted for outage fallback. */
  cacheKey?: string;
}

export interface RuleLoadResult<T> {
  data: T;
  downloaded: boolean;
  /** Set when the data came from the persisted outage fallback instead of the feed. */
  stale?: boolean;
}

interface FreshLoad<T> {
  data: T;
  fromNetwork: boolean;
  stale?: boolean;
}

/**
 * Builds a memoized loader for a remote rule-data source. The first call
 * downloads the URL and applies `transform`; later calls reuse the cached
 * result. When `refetch` is set, every call re-downloads instead. A failed
 * download is not cached, so the next call retries it; rules declaring a
 * `cacheKey` fall back to their last successfully persisted payload.
 */
export function remoteDataLoader<T>(source: RuleDataLoader<T>, refetch = false): () => Promise<RuleLoadResult<T>> {
  let cached: Promise<T> | null = null;

  const loadFresh = async (): Promise<FreshLoad<T>> => {
    try {
      const response = await fetch(source.url, {
        headers: { 'user-agent': 'chaotic-next/diff-scan' },
        signal: AbortSignal.timeout(RULE_DATA_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Rule data download failed (${response.status}) for ${source.url}`);
      const raw = await response.text();
      if (source.cacheKey !== undefined) {
        void ruleDataStore()
          ?.save(source.cacheKey, raw)
          .catch(() => undefined);
      }
      return { data: source.transform(raw), fromNetwork: true };
    } catch (err) {
      const raw =
        source.cacheKey !== undefined
          ? await ruleDataStore()
              ?.load(source.cacheKey)
              .catch(() => null)
          : null;
      if (raw === null || raw === undefined) throw err;
      return { data: source.transform(raw), fromNetwork: false, stale: true };
    }
  };

  return async () => {
    if (!refetch && cached) return { data: await cached, downloaded: false };

    const pending = loadFresh();
    if (!refetch) {
      cached = pending.then((loaded) => loaded.data);
      void cached.catch(() => {
        cached = null;
      });
    }

    const { data, fromNetwork, stale } = await pending;
    return {
      data,
      downloaded: fromNetwork,
      stale,
    };
  };
}

export interface Rule<T = void> {
  id: string;
  name: string;
  severity: DiffScanSeverity;
  description: string;
  /** Limits the rule to certain scan surfaces; defaults to running everywhere. */
  runsOn?: readonly RuleSurface[];
  load?: () => Promise<RuleLoadResult<T>>;
  refetch?: boolean;
  check(change: MergeRequestDiffSchema): RuleHit | null;
  /**
   * Cross-file checks receive every scanned file at once and report hits per
   * file. They run once per scan (not per change) on the surfaces in `runsOn`.
   */
  checkGroup?(changes: MergeRequestDiffSchema[]): GroupRuleHit[];
}

export function ruleRunsOn(rule: Rule<unknown>, surface: RuleSurface): boolean {
  return (rule.runsOn ?? ['mr-diff', 'full-file']).includes(surface);
}

export interface RegexRuleDataOptions<T> {
  url: string;
  transform: (raw: string) => T;
  buildPattern: (data: T) => RegExp;
  refetch?: boolean;
  cacheKey?: string;
}

export interface RegexRuleOptions<T = void> {
  id: string;
  name: string;
  severity: DiffScanSeverity;
  description: string;
  pattern: RegExp;
  scopes?: RuleScope[];
  scanComments?: boolean;
  /** Skip matches inside quoted strings (for example, install scriptlet messages such as "sudo ..."). Only raw matches are affected. */
  skipQuoted?: boolean;
  /** Match the raw line only, for rules that detect the obfuscation itself. */
  rawOnly?: boolean;
  /** Adjusts the emitted hit (severity/note) based on the matched line. Use it to downgrade known-benign forms. */
  classify?: (lineText: string) => Pick<RuleHit, 'severity' | 'note'> | undefined;
  /** Lazily loads a remote data source and rebuilds `pattern` from it. */
  data?: RegexRuleDataOptions<T>;
}

export function regexRule<T>(options: RegexRuleOptions<T>): Rule<T> {
  let pattern = options.pattern;
  const rule: Rule<T> = {
    id: options.id,
    name: options.name,
    severity: options.severity,
    description: options.description,
    check(change) {
      if (!isInScope(change, options.scopes ?? ['any'])) return null;
      for (const line of addedLines(change)) {
        if (!options.scanComments && isCommentLine(line.text)) continue;
        const rawMatch = line.text.match(pattern);
        const rawHit =
          rawMatch !== null && !(options.skipQuoted && isInsideQuotedString(line.text, rawMatch.index ?? 0));
        const deobfuscatedHit =
          !rawHit && !options.rawOnly && !options.skipQuoted && matchesDeobfuscated(line.text, pattern);
        if (rawHit || deobfuscatedHit) {
          return { line: line.line, match: line.text.trim(), ...options.classify?.(line.text) };
        }
      }
      return null;
    },
  };

  if (options.data) {
    const { url, transform, buildPattern, refetch, cacheKey } = options.data;
    const loadData = remoteDataLoader({ url, transform, cacheKey }, refetch);
    rule.load = async () => {
      const { data, downloaded } = await loadData();
      pattern = buildPattern(data);
      return { data, downloaded };
    };
    if (refetch) rule.refetch = true;
  }

  return rule;
}

export interface ListRuleDataOptions {
  url: string;
  transform: (raw: string) => string[];
  refetch?: boolean;
  cacheKey?: string;
}

export interface ListRuleOptions {
  id: string;
  name: string;
  severity: DiffScanSeverity;
  description: string;
  /** Regex sources to look out for; each chunk is compiled into its own alternation. */
  list: string[];
  scopes?: RuleScope[];
  scanComments?: boolean;
  /** Skip matches inside quoted strings (for example, install scriptlet messages such as "sudo ..."). Only raw matches are affected. */
  skipQuoted?: boolean;
  /** Match the raw line only, for rules that detect the obfuscation itself. */
  rawOnly?: boolean;
  /** Lazily loads a remote list and merges its entries into `list`. */
  data?: ListRuleDataOptions;
}

// Split a large list into several smaller parts to keep the regex small
const LIST_RULE_CHUNK_SIZE = 100;

/**
 * Builds a rule that flags lines containing any entry from `list`. Entries are
 * regex sources, so the rule is generic and reusable for any "list of things to
 * look out for" (hosts, tokens, file names, …). Large lists are split into
 * bounded alternations so the pattern stays cheap to compile and match.
 */
export function listRule(options: ListRuleOptions): Rule<string[]> {
  let patterns = compilePatterns(options.list);
  const rule: Rule<string[]> = {
    id: options.id,
    name: options.name,
    severity: options.severity,
    description: options.description,
    check(change) {
      if (!isInScope(change, options.scopes ?? ['any'])) return null;
      for (const line of addedLines(change)) {
        if (!options.scanComments && isCommentLine(line.text)) continue;
        const rawHit = matchesAny(line.text, patterns, options.skipQuoted);
        const deobfuscatedHit =
          !rawHit && !options.rawOnly && matchesAny(deobfuscateLine(line.text), patterns, options.skipQuoted);
        if (rawHit || deobfuscatedHit) {
          return { line: line.line, match: line.text.trim() };
        }
      }
      return null;
    },
  };

  if (options.data) {
    const { url, transform, refetch, cacheKey } = options.data;
    const loadData = remoteDataLoader({ url, transform, cacheKey }, refetch);
    rule.load = async () => {
      const { data: loaded, downloaded } = await loadData();
      patterns = compilePatterns([...options.list, ...loaded]);
      return { data: loaded, downloaded };
    };
    if (refetch) rule.refetch = true;
  }

  return rule;
}

function compilePatterns(entries: string[]): RegExp[] {
  const patterns: RegExp[] = [];
  for (let i = 0; i < entries.length; i += LIST_RULE_CHUNK_SIZE) {
    patterns.push(new RegExp(entries.slice(i, i + LIST_RULE_CHUNK_SIZE).join('|'), 'i'));
  }
  return patterns;
}

function matchesAny(text: string, patterns: RegExp[], skipQuoted: boolean | undefined): boolean {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match !== null && !(skipQuoted && isInsideQuotedString(text, match.index ?? 0))) return true;
  }
  return false;
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

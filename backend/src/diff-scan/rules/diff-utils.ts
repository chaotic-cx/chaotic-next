import { type MergeRequestDiffSchema } from '@gitbeaker/core';
import { posix } from 'node:path';

export type RuleScope = 'any' | 'pkgbuild' | 'install' | 'code';

export interface AddedLine {
  /** Line number in the new file, derived from the hunk headers. */
  line: number;
  /** Line content without the leading "+" of the diff. */
  text: string;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const COMMENT_LINE = /^\s*#/;

/** Minimum length of a base64 run worth trying to decode. */
const MIN_BASE64_RUN = 16;
/** Decoded base64 payloads shorter than this are too small to be a meaningful command. */
const MIN_DECODED_PAYLOAD = 8;
/** Decoded base64 payloads longer than this are unlikely to be an inlined command. */
const MAX_DECODED_PAYLOAD = 500;
/** Quote splicing can overlap (a"b"c), so repeat until the line stops changing. */
const MAX_SPLICE_PASSES = 5;

export const INSTALL_SCRIPT_PATTERN = /\.(install|hook)$/;
export const SYSTEMD_UNIT_PATTERN = /\.(service|timer)$/;

export function isCommentLine(text: string): boolean {
  return COMMENT_LINE.test(text);
}

/**
 * Normalizes common shell obfuscation so content rules can match the underlying
 * command: decodes ANSI-C escape segments ($'\x64' → d), expands ${IFS} to a space,
 * removes quotes spliced into words (cu""rl → curl) and inlines base64 blobs whose
 * payload is printable text. Obfuscation-detecting rules must match the raw line
 * instead.
 */
export function deobfuscateLine(text: string): string {
  let result = text.replace(/\$'([^']*)'/g, (whole, escaped: string) =>
    escaped
      .replace(/\\x([0-9a-fA-F]{2})/g, (match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
      .replace(/\\([0-7]{1,3})/g, (match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8))),
  );
  result = result.replaceAll('${IFS}', ' ');
  result = result.replace(
    new RegExp(`[A-Za-z0-9+/]{${MIN_BASE64_RUN},}={0,2}`, 'g'),
    (blob) => decodeBase64Run(blob) ?? blob,
  );

  // Quote splicing can overlap (a"b"c), so repeat until it stops changing.
  for (let pass = 0; pass < MAX_SPLICE_PASSES; pass++) {
    const next = result.replace(/(\w)['"]+(\w)/g, '$1$2');
    if (next === result) break;
    result = next;
  }
  return result;
}

const PRINTABLE_TEXT = /^[\t\n\r\x20-\x7e]+$/;

/** Decodes a base64 run when it is well-formed and yields printable text; hex checksums stay as they are. */
function decodeBase64Run(blob: string): string | null {
  if (blob.length % 4 !== 0 && !blob.endsWith('=')) return null;
  if (/^[0-9a-f]+={0,2}$/i.test(blob)) return null;
  try {
    const decoded = Buffer.from(blob, 'base64').toString('latin1');
    if (decoded.length < MIN_DECODED_PAYLOAD || decoded.length > MAX_DECODED_PAYLOAD || !PRINTABLE_TEXT.test(decoded)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function isInScope(change: Pick<MergeRequestDiffSchema, 'new_path'>, scopes: RuleScope[]): boolean {
  return scopes.some((scope) => SCOPE_PREDICATES[scope](change.new_path));
}

const DOCUMENTATION_PATTERN = /\.(md|markdown|rst|txt|html|adoc|changelog)$/i;

const SCOPE_PREDICATES: Record<RuleScope, (newPath: string) => boolean> = {
  any: () => true,
  pkgbuild: (newPath) => posix.basename(newPath) === 'PKGBUILD',
  install: (newPath) => INSTALL_SCRIPT_PATTERN.test(newPath),
  // Any executable-ish file, excluding documentation that merely shows commands.
  code: (newPath) => !DOCUMENTATION_PATTERN.test(newPath),
};

interface WalkedLine {
  kind: 'added' | 'context' | 'removed';
  text: string;
  newLineNumber: number;
}

/**
 * Splits a unified diff into its in-hunk lines with their kinds and new-file line
 * numbers. Lines before the first hunk header (file headers, mode changes), the
 * "\ No newline at end of file" markers and the empty split artifact after the
 * final newline are dropped; removed lines do not advance the new-file counter.
 */
function walkHunks(diff: string): WalkedLine[] {
  const result: WalkedLine[] = [];
  let inHunk = false;
  let newLineNumber = 0;

  for (const raw of diff.split('\n')) {
    const hunk = raw.match(HUNK_HEADER);
    if (hunk) {
      newLineNumber = Number.parseInt(hunk[1], 10);
      inHunk = true;
      continue;
    }
    if (!inHunk || raw === '') continue;

    if (raw.startsWith('+')) {
      result.push({ kind: 'added', text: raw.slice(1), newLineNumber });
      newLineNumber++;
    } else if (raw.startsWith('-')) {
      result.push({ kind: 'removed', text: raw.slice(1), newLineNumber });
    } else if (raw.startsWith('\\')) {
      continue;
    } else {
      result.push({ kind: 'context', text: raw.slice(1), newLineNumber });
      newLineNumber++;
    }
  }
  return result;
}

/** The added lines with their line numbers in the new file. */
export function addedLines(change: Pick<MergeRequestDiffSchema, 'diff'>): AddedLine[] {
  return walkHunks(change.diff)
    .filter((line) => line.kind === 'added')
    .map((line) => ({ line: line.newLineNumber, text: line.text }));
}

/**
 * The lines of the new file that are visible in the diff (added and context lines),
 * keyed by their line number. Context-sensitive rules need this to see declarations
 * the diff does not touch, e.g. an unchanged "url=" next to changed sources.
 */
export function visibleFileLines(change: Pick<MergeRequestDiffSchema, 'diff'>): Map<number, string> {
  return new Map(
    walkHunks(change.diff)
      .filter((line) => line.kind !== 'removed')
      .map((line): [number, string] => [line.newLineNumber, line.text]),
  );
}

/** Removed line contents (without the leading "-"), for old-side comparisons. */
export function removedLineTexts(change: Pick<MergeRequestDiffSchema, 'diff'>): string[] {
  return walkHunks(change.diff)
    .filter((line) => line.kind === 'removed')
    .map((line) => line.text);
}

/** Git renders binary changes as literal/delta patches or a differ note. */
export function hasBinaryContent(change: Pick<MergeRequestDiffSchema, 'diff'>): boolean {
  return change.diff.includes('GIT binary patch') || /^Binary files .* differ$/m.test(change.diff);
}

export function fileExtension(path: string): string {
  return posix.extname(path).slice(1).toLowerCase();
}

export function hasBinaryExtension(newPath: string): boolean {
  const extension = fileExtension(newPath);
  return EXECUTABLE_BINARY_EXTENSIONS.has(extension) || DATA_BINARY_EXTENSIONS.has(extension);
}

/** Binaries that execute or load as code. */
export const EXECUTABLE_BINARY_EXTENSIONS = new Set([
  'bin',
  'class',
  'crx',
  'dll',
  'dylib',
  'exe',
  'jar',
  'node',
  'pyc',
  'so',
  'wasm',
]);

/** Binary blobs that are data rather than code, e.g. committed archives or images. */
export const DATA_BINARY_EXTENSIONS = new Set([
  'a',
  'apk',
  'deb',
  'gif',
  'gz',
  'img',
  'iso',
  'jpeg',
  'jpg',
  'o',
  'png',
  'rpm',
  'svgz',
  'tar',
  'tgz',
  'webp',
  'xz',
  'zst',
]);

const ECHO_HEREDOC_START = /^\s*cat\s*<<-?['"]?([A-Za-z_]\w*)['"]?\s*$/;

/**
 * Blanks the body of heredocs that only print text: `cat <<EOF` with no
 * redirect, no pipe, and no command substitution. Rules match shell commands,
 * and printed user instructions contain many path and command words. Heredocs
 * that write to a file or feed a command keep every line: their content runs
 * later and is scanned like any other script.
 */
export function maskEchoHeredocs(diff: string): string {
  let terminator: string | null = null;
  return diff
    .split('\n')
    .map((raw) => {
      if (!raw.startsWith('+') || raw.startsWith('+++')) return raw;
      const content = raw.slice(1);
      if (terminator !== null) {
        if (content.trim() === terminator) terminator = null;
        else return '+';
        return raw;
      }
      const opener = content.match(ECHO_HEREDOC_START);
      if (opener) {
        terminator = opener[1];
        return raw;
      }
      return raw;
    })
    .join('\n');
}

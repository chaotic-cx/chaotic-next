/**
 * Parsers for the raw output of binutils/libarchive utils (bsdtar, readelf, nm)
 * plus small path helpers. Everything here maps strings to plain data.
 */
import { type RuntimeName } from './graph';

export function parseFileList(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith('/'));
}

/**
 * Parse `bsdtar -tvf <archive>` output. The listing format is
 * `<mode> <owner> <size> <Mon DD HH:MM|YYYY> <name>`; the middle columns vary
 * (uid/gid, `root/root` or `0 root root`, ISO vs ls dates) so they are matched
 * loosely. Only the leading mode column and the trailing name are used.
 */
const TAR_VERBOSE_LINE =
  /^(-[rwxsStT-]{9})\s+.*?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4})\s+(.+)$/;

export function isExecutableRegularFile(mode: string): boolean {
  if (mode.length !== 10 || mode[0] !== '-') return false;
  return mode[3] === 'x' || mode[3] === 's' || mode[6] === 'x' || mode[6] === 's' || mode[9] === 'x' || mode[9] === 's';
}

export function parseTarVerboseList(output: string): { path: string; mode: string }[] {
  const entries: { path: string; mode: string }[] = [];
  for (const line of output.split('\n')) {
    const match = TAR_VERBOSE_LINE.exec(line);
    if (match) entries.push({ path: match[2], mode: match[1] });
  }
  return entries;
}

export function parseReadelfDynamic(output: string): { needed: string[]; soname: string | null } {
  const needed: string[] = [];
  let soname: string | null = null;
  for (const line of output.split('\n')) {
    const neededMatch = /\(NEEDED\)\s+Shared library: \[([^\]]+)\]/.exec(line);
    if (neededMatch) {
      needed.push(neededMatch[1]);
      continue;
    }
    const sonameMatch = /\(SONAME\)\s+Library soname: \[([^\]]+)\]/.exec(line);
    if (sonameMatch) {
      soname = sonameMatch[1];
    }
  }
  return { needed, soname };
}

export function parseUndefinedSymbols(output: string): string[] {
  const symbols: string[] = [];
  for (const line of output.split('\n')) {
    const match = /^\s*[UwV]\s+(.+)$/.exec(line);
    if (!match) continue;
    let name = match[1].trim();
    const at = name.indexOf('@');
    if (at !== -1) name = name.slice(0, at);
    if (name) symbols.push(name);
  }
  return symbols;
}

export function parseDefinedSymbols(output: string): string[] {
  const symbols: string[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^\S+\s+[A-Za-z]\s+(.+)$/.exec(trimmed);
    if (match) symbols.push(match[1].trim());
  }
  return symbols;
}

/**
 * A single relocation entry parsed from `readelf -rW`. Relocations are how the
 * dynamic linker fixes up pointers at load time. A C++ vtable is a block of
 * absolute relocations in `.data.rel.ro`, one per virtual slot, so the ordered
 * symbol list *is* the vtable layout.
 */
export interface RelocationEntry {
  /** Address/offset the relocation applies to (hex-decoded). */
  offset: number;
  /** Relocation type, e.g. "R_X86_64_64" (absolute pointer) or "R_X86_64_RELATIVE". */
  type: string;
  /** The symbol the relocation points at, when one is resolved. */
  symbol?: string;
}

export function parseReadelfRelocations(output: string): RelocationEntry[] {
  const entries: RelocationEntry[] = [];
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    const match = /^([0-9a-f]{8,16})\s+[0-9a-f]+\s+(\S+)\s+([0-9a-f]+)\s+(\S+)/.exec(line);
    if (!match) continue;
    // Consume wrapped continuation lines (they only extend the symbol column).
    while (i + 1 < lines.length && !/^[0-9a-f]{8,16}\s+[0-9a-f]+\s+R_/.test(lines[i + 1].trim())) {
      line += lines[++i].trim();
    }
    const entry: RelocationEntry = { offset: parseInt(match[1], 16), type: match[2] };
    const symbol = match[4];
    if (symbol !== '' && !/^[0-9a-f]+\+$/.test(symbol)) {
      entry.symbol = symbol.replace(/@.*/, '').trim();
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * A defined symbol with address and size from `nm -D -S --defined-only`,
 * e.g. `000000000090e698 0000000000000070 D _ZTVN4KWin10ActivitiesE`.
 * The address/size range lets us attribute relocations to a symbol (a vtable).
 */
export interface NmSymbolWithSize {
  address: number;
  size: number;
  type: string;
  name: string;
}

export function parseNmSymbolsWithSize(output: string): NmSymbolWithSize[] {
  const symbols: NmSymbolWithSize[] = [];
  for (const line of output.split('\n')) {
    const match = /^([0-9a-f]+)\s+([0-9a-f]+)\s+(\S)\s+(.+)$/.exec(line.trim());
    if (match) {
      symbols.push({
        address: parseInt(match[1], 16),
        size: parseInt(match[2], 16),
        type: match[3],
        name: match[4].replace(/@.*/, '').trim(),
      });
    }
  }
  return symbols;
}

export function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

export function parentDirectory(path: string): string | null {
  const idx = path.lastIndexOf('/');
  if (idx === -1) return null;
  return path.slice(0, idx);
}

export function ancestorDirectories(path: string): string[] {
  const parts = path.split('/');
  parts.pop();
  const dirs: string[] = [];
  let acc = '';
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    dirs.push(acc);
  }
  return dirs;
}

export function isElfSharedObject(path: string): boolean {
  return path.endsWith('.so') || path.includes('.so.');
}

export function sonameBasename(soname: string): string {
  return soname.slice(soname.lastIndexOf('/') + 1);
}

export function libraryBaseName(soname: string): string {
  const base = sonameBasename(soname);
  const versionIndex = base.indexOf('.so.');
  return versionIndex === -1 ? base : base.slice(0, versionIndex + 3);
}

/** Soname prefixes that identify a package as providing a runtime's own interpreter library. */
export const RUNTIME_INTERPRETER_PREFIX: Partial<Record<RuntimeName, string>> = {
  python: 'libpython',
  perl: 'libperl',
  ruby: 'libruby',
};

/** The interpreter prefixes as a list, used for family matching. */
const RUNTIME_SONAME_PREFIXES: readonly string[] = Object.values(RUNTIME_INTERPRETER_PREFIX);

export function sameLibraryFamily(a: string, b: string): boolean {
  if (libraryBaseName(a) === libraryBaseName(b)) return true;
  return RUNTIME_SONAME_PREFIXES.some((prefix) => a.startsWith(prefix) && b.startsWith(prefix));
}

export function latestAnalysisByKey<T extends { version: string }>(
  analyses: readonly T[],
  keyOf: (row: T) => string,
): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of analyses) {
    const key = keyOf(row);
    const existing = latest.get(key);
    if (!existing || compareArchVersions(row.version, existing.version) > 0) latest.set(key, row);
  }
  return latest;
}

function splitArchVersion(version: string): { epoch: string; version: string; pkgrel: string } {
  const [epochAndRest, pkgrel] = version.includes('-') ? version.split('-') : [version, ''];
  const [epoch, rest] = epochAndRest.includes(':') ? epochAndRest.split(':') : ['', epochAndRest];
  return { epoch, version: rest, pkgrel };
}

function compareSegments(a: string, b: string): number {
  // Pacman compares alternating numeric/alphanumeric runs.
  let i = 0;
  let j = 0;
  const lenA = a.length;
  const lenB = b.length;
  while (i < lenA || j < lenB) {
    const aNum = i < lenA && /\d/.test(a[i]);
    const bNum = j < lenB && /\d/.test(b[j]);
    if (!aNum && !bNum) {
      const ac = i < lenA ? a[i] : '';
      const bc = j < lenB ? b[j] : '';
      if (ac < bc) return -1;
      if (ac > bc) return 1;
      i++;
      j++;
      continue;
    }
    if (aNum && !bNum) return 1;
    if (!aNum && bNum) return -1;
    // Both numeric: consume the full run and compare by value.
    let na = 0;
    let nb = 0;
    while (i < lenA && /\d/.test(a[i])) {
      na = na * 10 + Number(a[i]);
      i++;
    }
    while (j < lenB && /\d/.test(b[j])) {
      nb = nb * 10 + Number(b[j]);
      j++;
    }
    if (na !== nb) return na > nb ? 1 : -1;
  }
  return 0;
}

export function compareArchVersions(a: string, b: string): number {
  const pa = splitArchVersion(a);
  const pb = splitArchVersion(b);
  const epochA = pa.epoch === '' ? 0 : Number(pa.epoch);
  const epochB = pb.epoch === '' ? 0 : Number(pb.epoch);
  if (epochA !== epochB) return epochA > epochB ? 1 : -1;
  const ver = compareSegments(pa.version, pb.version);
  if (ver !== 0) return ver;
  return compareSegments(pa.pkgrel, pb.pkgrel);
}

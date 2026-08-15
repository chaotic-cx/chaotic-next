import { execFile, type ExecFileOptionsWithStringEncoding } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { errorMessage } from '../../utils/functions';
import { isElfSharedObject, isExecutableRegularFile, parseTarVerboseList } from '../signal';

const execFileP = promisify(execFile);

const MAX_TAR_BUFFER = 1 << 28;

/** Per-tool time budget so a single stuck readelf/nm cannot hang a whole scan. */
const TOOL_TIMEOUT_MS = 5 * 60 * 1000;

// Large GHC/Haskell shared objects (e.g. libHSAgda-*.so) can produce hundreds
// of MB of readelf/nm output; keep the buffers generous so real packages never
// trip the "stdout maxBuffer length exceeded" error. The utils are awaited per
// candidate, so memory stays bounded to one candidate's outputs at a time.
const TOOL_OPTS: ExecFileOptionsWithStringEncoding = { maxBuffer: 1 << 28, timeout: TOOL_TIMEOUT_MS, encoding: 'utf8' };
const RELOC_TOOL_OPTS: ExecFileOptionsWithStringEncoding = {
  maxBuffer: 1 << 30,
  timeout: TOOL_TIMEOUT_MS,
  encoding: 'utf8',
};

/**
 * Packages shipping more ELF candidates than this are skipped: a pathological
 * archive (e.g. Quartus' bundled toolchain with ~1900 objects) would otherwise
 * dominate an index run, and extracting it in one pass could exceed the command
 * line length limit. The skip surfaces as a warning and the analysis is left
 * untouched.
 */
const MAX_ELF_CANDIDATES = 5000;

/**
 * Raw tool outputs of one package archive, ready for `buildAnalysis`.
 * DB-free and process-local so the offline indexer can reuse the exact same
 * pipeline as the running backend.
 */
export interface ScanArchiveResult {
  fileList: string;
  readelfByFile: Map<string, string>;
  importsByFile: Map<string, string>;
  exportsByFile: Map<string, string>;
  relocationsByFile: Map<string, string>;
  nmSizesByFile: Map<string, string>;
  /** Non-fatal tool failures (timeout, ENOMEM, maxBuffer) per candidate file. */
  warnings: string[];
}

export function isNonZeroExit(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code: unknown }).code === 'number'
  );
}

/**
 * Readelf header lines the scanner compares against. We only index host-arch
 * Linux ELF objects so that foreign-platform binaries bundled by some packages
 * (a Solaris JVM's libc.so.1, an ARM toolchain's ld-linux-armhf.so.3, BSD
 * libkvm.so.2) cannot mark a healthy package broken.
 */
const ELF64_RE = /Class:\s+ELF64/;
const X86_64_RE = /Machine:\s+Advanced Micro Devices X86-64/;
// Linux ELF objects carry either the generic System V ABI or the GNU ABI
// (statically linked or GNU-extension binaries; readelf prints "UNIX - GNU").
// Solaris (`UNIX - Solaris`), FreeBSD/OpenBSD and other OS-specific ABIs
// identify foreign binaries even when they share the x86_64 machine type
// (e.g. JNA's bundled sunos-* libs).
const LINUX_ABI_RE = /OS\/ABI:\s+UNIX - (?:System V|GNU)/;

export function isHostElf(readelfHeader: string): boolean {
  return ELF64_RE.test(readelfHeader) && X86_64_RE.test(readelfHeader) && LINUX_ABI_RE.test(readelfHeader);
}

function emptyResult(fileList: string, warning: string): ScanArchiveResult {
  return {
    fileList,
    readelfByFile: new Map(),
    importsByFile: new Map(),
    exportsByFile: new Map(),
    relocationsByFile: new Map(),
    nmSizesByFile: new Map(),
    warnings: [warning],
  };
}

/** The raw file listing of an archive plus the ELF candidates to extract. */
interface ArchiveListing {
  fileList: string;
  candidates: Set<string>;
}

async function listArchive(file: string): Promise<ArchiveListing> {
  const [{ stdout: fileList }, { stdout: verboseList }] = await Promise.all([
    execFileP('bsdtar', ['-tf', file], { maxBuffer: MAX_TAR_BUFFER }),
    execFileP('bsdtar', ['-tvf', file], { maxBuffer: MAX_TAR_BUFFER }),
  ]);
  const files = fileList
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.endsWith('/'));
  const executableFiles = parseTarVerboseList(verboseList)
    .filter((entry) => isExecutableRegularFile(entry.mode))
    .map((entry) => entry.path);
  return { fileList, candidates: new Set<string>([...files.filter(isElfSharedObject), ...executableFiles]) };
}

async function extractCandidates(file: string, workDir: string, candidates: Set<string>): Promise<string | null> {
  if (candidates.size === 0) return null;
  try {
    await execFileP('bsdtar', ['-xf', file, '-C', workDir, ...candidates], { maxBuffer: MAX_TAR_BUFFER });
    return null;
  } catch (err) {
    if (!isNonZeroExit(err)) throw err;
    // bsdtar exits non-zero when a member is missing; since candidates came
    // from the listing this should not happen, but surface it rather than
    // silently producing a partial scan.
    return `Extraction failed for ${file}: ${errorMessage(err)}`;
  }
}

/** One candidate's tool outputs; `shared` is only set for shared objects. */
interface CandidateOutputs {
  readelf: string;
  imports: string;
  shared?: { exports: string; relocations: string; nmSizes: string };
}

async function scanCandidate(candidate: string, workDir: string): Promise<CandidateOutputs | null> {
  const out = join(workDir, candidate);
  const { stdout: header } = await execFileP('readelf', ['-h', out], TOOL_OPTS);
  // Skip foreign-platform ELF objects (Solaris JVM libs, ARM loaders,
  // BSD kvm): the host linker never loads them, so their DT_NEEDED
  // entries must not count against the package.
  if (!isHostElf(header)) return null;

  const tools: Promise<{ stdout: string }>[] = [
    execFileP('readelf', ['-dW', out], TOOL_OPTS),
    execFileP('nm', ['-D', '--undefined-only', out], TOOL_OPTS),
  ];
  if (isElfSharedObject(candidate)) {
    tools.push(execFileP('nm', ['-D', '--defined-only', out], TOOL_OPTS));
    tools.push(execFileP('readelf', ['-rW', out], RELOC_TOOL_OPTS));
    tools.push(execFileP('nm', ['-D', '-S', '--defined-only', out], RELOC_TOOL_OPTS));
  }
  const [readelf, imports, exports, relocations, nmSizes] = await Promise.all(tools);
  return {
    readelf: readelf.stdout,
    imports: imports.stdout,
    shared:
      exports && relocations && nmSizes
        ? { exports: exports.stdout, relocations: relocations.stdout, nmSizes: nmSizes.stdout }
        : undefined,
  };
}

export async function scanArchive(file: string, maxCandidates = MAX_ELF_CANDIDATES): Promise<ScanArchiveResult | null> {
  const workDir = await mkdtemp(join(tmpdir(), 'signal-scan-'));
  try {
    const listing = await listArchive(file);
    if (listing.candidates.size > maxCandidates) {
      return emptyResult(
        listing.fileList,
        `Skipped ${file}: ${listing.candidates.size} ELF candidates exceed the ${maxCandidates} limit`,
      );
    }

    const extractionWarning = await extractCandidates(file, workDir, listing.candidates);
    if (extractionWarning) return emptyResult(listing.fileList, extractionWarning);

    const result: ScanArchiveResult = {
      fileList: listing.fileList,
      readelfByFile: new Map(),
      importsByFile: new Map(),
      exportsByFile: new Map(),
      relocationsByFile: new Map(),
      nmSizesByFile: new Map(),
      warnings: [],
    };
    for (const candidate of listing.candidates) {
      try {
        const outputs = await scanCandidate(candidate, workDir);
        if (!outputs) continue;
        result.readelfByFile.set(candidate, outputs.readelf);
        result.importsByFile.set(candidate, outputs.imports);
        if (outputs.shared) {
          result.exportsByFile.set(candidate, outputs.shared.exports);
          result.relocationsByFile.set(candidate, outputs.shared.relocations);
          result.nmSizesByFile.set(candidate, outputs.shared.nmSizes);
        }
      } catch (err) {
        // readelf/nm exit non-zero on non-ELF input (e.g. a script carrying
        // an executable bit); that's expected and skipped. Anything else
        // (timeout, ENOMEM, maxBuffer) is surfaced as a warning and the scan
        // of the remaining candidates continues.
        if (!isNonZeroExit(err)) {
          result.warnings.push(`Tool failure on ${candidate} in ${file}: ${errorMessage(err)}`);
        }
      }
    }
    return result;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

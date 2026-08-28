import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanArchive, isNonZeroExit, isHostElf } from './scan-archive';

const execFileP = promisify(execFile);

const FMT_PKG = join(import.meta.dirname, '..', '__fixtures__', 'fmt-12.0.0-1-x86_64.pkg.tar.zst');

describe('isNonZeroExit', () => {
  it('detects numeric exit codes', () => {
    expect(isNonZeroExit({ code: 1 })).toBe(true);
    expect(isNonZeroExit({ code: 0 })).toBe(true);
  });

  it('returns false for non-tool errors', () => {
    expect(isNonZeroExit(new Error('boom'))).toBe(false);
    expect(isNonZeroExit({ code: 'ENOENT' })).toBe(false);
    expect(isNonZeroExit(null)).toBe(false);
  });
});

describe('isHostElf', () => {
  it('accepts x86_64 ELF64 Linux objects', () => {
    expect(
      isHostElf(
        '  Class:                             ELF64\n  OS/ABI:                            UNIX - System V\n  Machine:                           Advanced Micro Devices X86-64',
      ),
    ).toBe(true);
  });

  it('rejects foreign-arch ELF objects', () => {
    expect(
      isHostElf(
        '  Class:                             ELF32\n  OS/ABI:                            UNIX - System V\n  Machine:                           ARM',
      ),
    ).toBe(false);
    expect(
      isHostElf(
        '  Class:                             ELF64\n  OS/ABI:                            UNIX - System V\n  Machine:                           Intel 80386',
      ),
    ).toBe(false);
    expect(isHostElf('')).toBe(false);
  });

  it('rejects same-arch foreign-OS ELF objects', () => {
    expect(
      isHostElf(
        '  Class:                             ELF64\n  OS/ABI:                            UNIX - Solaris\n  Machine:                           Advanced Micro Devices X86-64',
      ),
    ).toBe(false);
  });

  it('accepts GNU-ABI host binaries (statically linked or GNU extensions)', () => {
    expect(
      isHostElf(
        '  Class:                             ELF64\n  OS/ABI:                            UNIX - GNU\n  Machine:                           Advanced Micro Devices X86-64',
      ),
    ).toBe(true);
  });
});

describe('scanArchive (real fmt package)', () => {
  // Assigned in beforeAll; a null scan throws there so tests can assert on it.
  let result!: NonNullable<Awaited<ReturnType<typeof scanArchive>>>;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fmt-scan-'));
    const scanned = await scanArchive(FMT_PKG);
    if (!scanned) throw new Error('scanArchive returned null on the real fmt fixture');
    result = scanned;
  }, 60000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('scans the real archive without failing', () => {
    expect(result).not.toBeNull();
  });

  it('lists the real shipped files', () => {
    expect(result.fileList).toContain('usr/lib/libfmt.so.12.0.0');
    expect(result.fileList).toContain('usr/include/fmt/core.h');
    expect(result.fileList).toContain('usr/share/licenses/fmt/LICENSE');
  });

  it('collects readelf output for the shared object', () => {
    expect(result.readelfByFile.has('usr/lib/libfmt.so.12.0.0')).toBe(true);
    expect(result.readelfByFile.get('usr/lib/libfmt.so.12.0.0')).toContain('NEEDED');
  });

  it('collects imports and exports for the shared object', () => {
    expect(result.importsByFile.has('usr/lib/libfmt.so.12.0.0')).toBe(true);
    expect(result.exportsByFile.has('usr/lib/libfmt.so.12.0.0')).toBe(true);
    // fmt depends on libstdc++ and libm
    expect(result.readelfByFile.get('usr/lib/libfmt.so.12.0.0')).toContain('libstdc++.so.6');
  });

  it('collects relocations and nm sizes for the shared object', () => {
    expect(result.relocationsByFile.has('usr/lib/libfmt.so.12.0.0')).toBe(true);
    expect(result.nmSizesByFile.has('usr/lib/libfmt.so.12.0.0')).toBe(true);
  });

  it('produces no warnings on a healthy package', () => {
    expect(result.warnings).toEqual([]);
  });
});

describe('scanArchive (non-ELF archive)', () => {
  it('returns an empty scan for an archive with no ELF candidates', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'noelf-'));
    const archive = join(dir, 'data.tar');
    try {
      // A tar containing only a text file (no .so, not executable)
      const payload = join(dir, 'payload.txt');
      await writeFile(payload, 'not elf\n');
      await execFileP('tar', ['-cf', archive, '-C', dir, 'payload.txt']);
      const result = await scanArchive(archive);
      if (!result) throw new Error('scanArchive unexpectedly returned null');
      expect(result.readelfByFile.size).toBe(0);
      expect(result.warnings).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60000);
});

describe('scanArchive (candidate limit)', () => {
  it('skips archives whose ELF candidate count exceeds the limit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'heavy-'));
    const archive = join(dir, 'heavy.tar');
    try {
      // Two fake shared objects; a limit of 1 must cause a skip.
      const soA = join(dir, 'liba.so');
      const soB = join(dir, 'libb.so');
      await writeFile(soA, 'not really elf\n');
      await writeFile(soB, 'not really elf\n');
      await execFileP('tar', ['-cf', archive, '-C', dir, 'liba.so', 'libb.so']);
      const result = await scanArchive(archive, 1);
      if (!result) throw new Error('scanArchive unexpectedly returned null');
      expect(result.readelfByFile.size).toBe(0);
      expect(result.warnings[0]).toContain('2 ELF candidates exceed the 1 limit');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60000);

  it('scans archives within the candidate limit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'within-'));
    const archive = join(dir, 'within.tar');
    try {
      const soA = join(dir, 'liba.so');
      await writeFile(soA, 'not really elf\n');
      await execFileP('tar', ['-cf', archive, '-C', dir, 'liba.so']);
      const result = await scanArchive(archive, 1);
      if (!result) throw new Error('scanArchive unexpectedly returned null');
      // Not a real ELF, but the scan must proceed past the limit check; the
      // skip message is only produced when the candidate count exceeds the cap.
      expect(result.warnings.some((w) => w.includes('exceed the'))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60000);
});

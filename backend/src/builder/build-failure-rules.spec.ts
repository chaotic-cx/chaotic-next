import { describe, expect, it } from 'vitest';
import { scanBuildLogForCause, stripAnsi, type BuildFailureScan } from './build-failure-rules';

const failedBuildLog = (tail: string): string => `
==> Making package: spotdl 4.2.10-1 (UTC 2026-08-20 10:11:16)
==> Checking runtime dependencies...
==> Installing missing dependencies...
error: target not found: python-spotipyfree
==> ERROR: 'pacman' failed to install missing dependencies.
==> ERROR: Could not resolve all dependencies.
${tail}
`;

describe('stripAnsi', () => {
  it('removes ANSI color codes and OSC hyperlink sequences', () => {
    const raw = '\x1B[32mgcc\x1B[0m: error:\x1B]3008;1;file.txt\x07hit\x1B]3007\x07';
    expect(stripAnsi(raw)).toBe('gcc: error:hit');
  });

  it('leaves plain log text untouched', () => {
    expect(stripAnsi('==> ERROR: A failure occurred in build().')).toBe('==> ERROR: A failure occurred in build().');
  });
});

describe('scanBuildLogForCause', () => {
  it('detects a missing pacman dependency and marks it silent', () => {
    const scan = scanBuildLogForCause(failedBuildLog('')) as BuildFailureScan;
    expect(scan.id).toBe('missing-dependency');
    expect(scan.tags).toContain('silent');
    expect(scan.snippet).toContain('python-spotipyfree');
  });

  it('detects a missing python module used by a script', () => {
    const log = `
[openboardview] ModuleNotFoundError: No module named 'jinja2'
Traceback (most recent call last):
  File "src/obv/obv.py", line 31, in <module>
==> ERROR: A failure occurred in build().`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('missing-python-module');
    expect(scan.tags).not.toContain('silent');
  });

  it('detects a dependency conflict', () => {
    const log = `
:: installing libadwaita (1.5.0-1)...
error: failed to prepare transaction (conflicting dependencies)
:: libadwaita and libadwaita-without-adwaita-git are in conflict
==> ERROR: Could not resolve all dependencies.`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('dependency-conflict');
    expect(scan.tags).not.toContain('silent');
  });

  it('detects a checksum mismatch', () => {
    const log = `
==> Validating source files with sha256sums...
    latte-dock.tar.xz ... FAILED
==> ERROR: One or more files did not pass the validity check!
==> ERROR: Failure while building package.`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('checksum-mismatch');
    expect(scan.snippet).toContain('validity check');
  });

  it('detects a failed source download', () => {
    const log = `
  % Total    % Received  % Xferd  Average Speed   Time    Time     Time  Current
curl: (22) The requested URL returned error: 404
==> ERROR: Failure while downloading https://files.blender.org/outdated.tar.xz
    Aborting...`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('download-failed');
  });

  it('treats a DNS failure as transient', () => {
    const log = `
fatal: unable to access 'https://github.com/foo/bar.git/':
Could not resolve host: github.com
==> ERROR: A failure occurred in prepare().`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('network-connect-error');
    expect(scan.tags).toContain('transient');
  });

  it('detects an empty build checkout and marks it interfere transient', () => {
    const log = `
grep: /home/builder/build//PKGBUILD: No such file or directory
==> ERROR: pkgver is not allowed to be empty.
==> ERROR: pkgname is not allowed to be empty.`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('checkout-missing-pkgbuild');
    expect(scan.tags).toEqual(expect.arrayContaining(['interfere', 'transient']));
  });

  it('detects a failing interfere prepare hook', () => {
    const log = `
/home/builder/build//prepare: line 13: _pkgver_new: parameter null or not set
/home/builder/build//prepare: line 13: [: -ge: unary operator expected
:: Interfere applied: prepare script executed.
==> ERROR: pkgver is not allowed to be empty.`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('interfere-prepare-failed');
    expect(scan.tags).toContain('interfere');
    expect(scan.tags).not.toContain('transient');
  });

  it('detects a missing dotnet SDK', () => {
    const log = `
Determining projects to restore...
error NETSDK1005: Assets file 'obj/project.assets.json' doesn't have a target for '.NETCoreApp,Version=v8.0'
It was not possible to find any installed .NET SDK. Install a .NET SDK from:
  https://aka.ms/dotnet/download`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('dotnet-sdk-missing');
    expect(scan.tags).toContain('toolchain');
  });

  it('detects an npm engine mismatch', () => {
    const log = `
npm warn EBADENGINE Unsupported engine {
npm warn EBADENGINE   package: 'napi-rs',
==> ERROR: A failure occurred in package().`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('npm-engine-mismatch');
    expect(scan.tags).toContain('toolchain');
  });

  it('prefers a root cause over the generic makepkg tail', () => {
    const log = `
collect2: error: ld returned 1 exit status
make: *** [Makefile:24: alvr_launcher] Error 1
==> ERROR: A failure occurred in build().`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('linker-error');
    expect(scan.tags).toContain('link');
  });

  it('detects a rust cargo error', () => {
    const log = `
error: could not compile \`libspa\` (lib) due to previous error
==> ERROR: A failure occurred in build().`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('cargo-error');
  });

  it('detects a packaging step that cannot find a file it needs', () => {
    const log = `
/usr/bin/install: cannot stat '/build/foo/etc/foo.conf': No such file or directory
==> ERROR: A failure occurred in package().`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('package-file-missing');
    expect(scan.tags).toContain('package');
  });

  it('detects a stale package artifact that blocks compression', () => {
    const log = `
Compressing packages in /home/builder/pkgout/...
zstd: /home/builder/pkgout//foo-1.0-1-x86_64.pkg.tar.zst already exists; not overwritten
Failed to compress /home/builder/pkgout//foo-1.0-1-x86_64.pkg.tar`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('stale-package-artifact');
    expect(scan.tags).toContain('package');
  });

  it('detects an install outside the staging dir that fails on permissions', () => {
    const log = `
cp: cannot create regular file '/usr/bin/gnome-theme-switcher': Permission denied
==> ERROR: A failure occurred in package_foo-git().`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('package-write-denied');
    expect(scan.tags).toContain('package');
  });

  it('falls back to the failing makepkg function with context', () => {
    const log = `
an obscure build step blew up
==> ERROR: A failure occurred in build().`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('build-makepkg-failure');
    expect(scan.snippet).toContain('an obscure build step blew up');
  });

  it('reports an invalid pkgver', () => {
    const log = `
==> ERROR: pkgver in provides is not allowed to be empty.
==> ERROR: A failure occurred in pkgver().`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('pkgver-invalid');
  });

  it('reports an empty pkgver from a sourced-but-empty checkout', () => {
    const log = `
==> ERROR: pkgver is not allowed to be empty.`;
    const scan = scanBuildLogForCause(log) as BuildFailureScan;
    expect(scan.id).toBe('pkgver-empty');
    expect(scan.tags).toContain('metadata');
  });

  it('returns null for a log without any known cause', () => {
    const scan = scanBuildLogForCause(
      `==> Making package: something
==> ERROR: A failure occurred in a weird custom step.`,
    );
    expect(scan).toBeNull();
  });
});

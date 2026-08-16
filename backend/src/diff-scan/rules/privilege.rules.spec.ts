import { describe, expect, it } from 'vitest';
import { PRIVILEGE_RULES } from './privilege.rules';
import { addedOnlyDiff, makeChange, ruleById } from './test-support';

describe('privilege rules', () => {
  it('flags sudo in PKGBUILD and install scriptlets', () => {
    expect(
      ruleById(PRIVILEGE_RULES, 'PRIV-001').check(makeChange(addedOnlyDiff(['sudo make install']))),
    ).not.toBeNull();
    expect(
      ruleById(PRIVILEGE_RULES, 'PRIV-001').check(
        makeChange(addedOnlyDiff(['pkexec --user root true']), { new_path: 'foo/foo.install' }),
      ),
    ).not.toBeNull();
  });

  it('does not flag sudo outside build and install scripts', () => {
    const change = makeChange(addedOnlyDiff(['sudo -u nobody true']), { new_path: 'foo/helper.sh' });
    expect(ruleById(PRIVILEGE_RULES, 'PRIV-001').check(change)).toBeNull();
  });

  it('does not flag package names and build flags that merely contain sudo/doas/pkexec', () => {
    const change = makeChange(
      addedOnlyDiff([
        'pkgname=sudo-git',
        '_pkgname=doas-sudo-shim',
        '-Dprivileged_group=sudo \\',
        'install -Dm0644 org.garuda.snapper-tools.pkexec.policy "$pkgdir/usr/share/polkit-1/actions/"',
      ]),
      { new_path: 'foo/PKGBUILD' },
    );
    expect(ruleById(PRIVILEGE_RULES, 'PRIV-001').check(change)).toBeNull();
  });

  it.each([
    ['PRIV-003', 'echo "ALL ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/backdoor'],
    ['PRIV-003', 'sed -i s/+/x/ /etc/sudoers'],
  ])('flags %s for %j', (id, line) => {
    expect(ruleById(PRIVILEGE_RULES, id).check(makeChange(addedOnlyDiff([line])))).not.toBeNull();
  });

  it('does not flag sudo inside quoted upgrade messages', () => {
    const change = makeChange(
      addedOnlyDiff([
        "'==>        sudo ln -s libxml2.so.16 /usr/lib/libxml2.so.2' \\",
        'echo "  sudo systemctl enable --now vopono.service"',
      ]),
      { new_path: 'foo/foo.install' },
    );
    expect(ruleById(PRIVILEGE_RULES, 'PRIV-001').check(change)).toBeNull();
  });
});

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

  it('does not flag unquoted dependency arrays containing sudo/doas/pkexec', () => {
    const change = makeChange(
      addedOnlyDiff(['depends=(sudo curl)', 'makedepends=(git doas)', 'checkdepends=(pkexec sudo)']),
      { new_path: 'foo/PKGBUILD' },
    );
    expect(ruleById(PRIVILEGE_RULES, 'PRIV-001').check(change)).toBeNull();
  });

  it.each([
    ['PRIV-003', 'echo "ALL ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/backdoor'],
    ['PRIV-003', 'sed -i s/+/x/ /etc/sudoers'],
    ['CAUR-SETUID', 'chmod u+s backdoor'],
    ['CAUR-SETUID', 'chmod 4755 /usr/local/bin/payload'],
    ['CAUR-SETUID', 'install -Dm4755 backdoor "$pkgdir"/usr/bin/bd'],
    ['CAUR-ADMIN-GROUP', 'usermod -aG wheel svc'],
    ['CAUR-ADMIN-GROUP', 'gpasswd -a attacker wheel'],
    ['CAUR-UID0-USER', 'useradd -o -u 0 -g 0 hax'],
    ['CAUR-UID0-USER', 'useradd --uid=0 backdoor'],
    ['CAUR-PASSWORD-DELETE', 'passwd -d root'],
    ['CAUR-PASSWORD-DELETE', 'passwd --delete svc'],
  ])('flags %s for %j', (id, line) => {
    expect(ruleById(PRIVILEGE_RULES, id).check(makeChange(addedOnlyDiff([line])))).not.toBeNull();
  });

  it.each([
    ['CAUR-SETUID', 'chmod 755 ./configure'],
    ['CAUR-SETUID', 'install -Dm755 build/app "$pkgdir"/usr/bin/app'],
    ['CAUR-ADMIN-GROUP', 'useradd -r -d /var/lib/foo foo'],
    ['CAUR-ADMIN-GROUP', 'usermod -aG video alice'],
    ['CAUR-UID0-USER', 'useradd -u 1000 build'],
    ['CAUR-PASSWORD-DELETE', 'passwd -S root'],
  ])('does not flag %s for %j', (id, line) => {
    expect(ruleById(PRIVILEGE_RULES, id).check(makeChange(addedOnlyDiff([line])))).toBeNull();
  });

  it('downgrades known browser helpers and setgid-only modes to warnings', () => {
    const sandbox = ruleById(PRIVILEGE_RULES, 'CAUR-SETUID').check(
      makeChange(addedOnlyDiff(['chmod 4755 "$pkgdir/opt/brave-bin/chrome-sandbox"'])),
    );
    expect(sandbox?.severity).toBe('warning');
    expect(sandbox?.note).toContain('upstream design');

    const setgid = ruleById(PRIVILEGE_RULES, 'CAUR-SETUID').check(
      makeChange(addedOnlyDiff(['chmod 2750 "$pkgdir"/etc/elasticsearch'])),
    );
    expect(setgid?.severity).toBe('warning');
    expect(setgid?.note).toContain('Setgid');
  });

  it('keeps unknown setuid binaries critical', () => {
    const hit = ruleById(PRIVILEGE_RULES, 'CAUR-SETUID').check(
      makeChange(addedOnlyDiff(['chmod 4755 /usr/local/bin/payload'])),
    );
    expect(hit).not.toBeNull();
    expect(hit?.note).toBeUndefined();
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

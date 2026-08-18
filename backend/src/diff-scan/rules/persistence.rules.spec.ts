import { describe, expect, it } from 'vitest';
import { PERSISTENCE_RULES } from './persistence.rules';
import { addedOnlyDiff, makeChange, ruleById } from './test-support';

describe('persistence rules', () => {
  it('flags a newly added install scriptlet', () => {
    const change = makeChange(addedOnlyDiff(['post_install() {', '  true', '}']), {
      new_path: 'foo/foo.install',
      new_file: true,
    });
    expect(ruleById(PERSISTENCE_RULES, 'CAUR-INSTALL-NEW').check(change)?.line).toBe(1);
  });

  it('flags a modified install scriptlet only when it adds lines', () => {
    const changed = makeChange(['@@ -1,3 +1,4 @@', ' post_install() {', '+  true', '}'].join('\n'), {
      new_path: 'foo/foo.install',
    });
    expect(ruleById(PERSISTENCE_RULES, 'CAUR-INSTALL-CHANGED').check(changed)).not.toBeNull();

    const commentOnly = makeChange(addedOnlyDiff(['# just a comment']), { new_path: 'foo/foo.install' });
    expect(ruleById(PERSISTENCE_RULES, 'CAUR-INSTALL-CHANGED').check(commentOnly)).not.toBeNull();

    const removedOnly = makeChange(['@@ -1,2 +1,1 @@', '-post_upgrade() {', '-}'].join('\n'), {
      new_path: 'foo/foo.install',
    });
    expect(ruleById(PERSISTENCE_RULES, 'CAUR-INSTALL-CHANGED').check(removedOnly)).toBeNull();
  });

  it('flags ALPM hooks like install scriptlets', () => {
    const change = makeChange(addedOnlyDiff(['[Trigger]']), { new_path: 'foo/foo.hook', new_file: true });
    expect(ruleById(PERSISTENCE_RULES, 'CAUR-INSTALL-NEW').check(change)).not.toBeNull();
  });

  it('flags added binaries by content marker and by extension', () => {
    const byMarker = makeChange('GIT binary patch\nliteral 1234\n');
    expect(ruleById(PERSISTENCE_RULES, 'CAUR-BINARY-ADDED').check(byMarker)).not.toBeNull();

    const byExtension = makeChange(addedOnlyDiff(['ELF...']), { new_path: 'foo/payload.bin', new_file: true });
    expect(ruleById(PERSISTENCE_RULES, 'CAUR-BINARY-ADDED').check(byExtension)).not.toBeNull();

    const modifiedText = makeChange(addedOnlyDiff(['plain text']), { new_path: 'foo/notes.bin' });
    expect(ruleById(PERSISTENCE_RULES, 'CAUR-BINARY-ADDED').check(modifiedText)).toBeNull();
  });

  it('downgrades committed data blobs like patch archives to a warning', () => {
    const change = makeChange('Binary files a/x.patch.xz and b/x.patch.xz differ\n', {
      new_path: 'waterfox/0001-fix.patch.xz',
      new_file: true,
    });
    expect(ruleById(PERSISTENCE_RULES, 'CAUR-BINARY-ADDED').check(change)?.severity).toBe('warning');
  });

  it('flags newly added systemd units', () => {
    const change = makeChange(addedOnlyDiff(['[Unit]', 'Description=x']), {
      new_path: 'foo/foo.service',
      new_file: true,
    });
    expect(ruleById(PERSISTENCE_RULES, 'CAUR-SYSTEMD-UNIT-ADDED').check(change)).not.toBeNull();
  });

  it.each([
    ['PERSIST-001', 'systemctl --user enable foo.service'],
    ['PERSIST-002', 'OnCalendar=*-*-* 04:00:00'],
    ['PERSIST-004', 'echo x > /etc/rc.local'],
    ['PERSIST-006', 'ExecStart=/usr/bin/systemd-cacheupd'],
  ])('flags %s for %j', (id, line) => {
    expect(ruleById(PERSISTENCE_RULES, id).check(makeChange(addedOnlyDiff([line])))).not.toBeNull();
  });

  it('flags the restart-persistence signature only when always-restart and a long delay combine', () => {
    const unit = makeChange(addedOnlyDiff(['Restart=always', 'RestartSec=30']), { new_path: 'foo/foo.service' });
    expect(ruleById(PERSISTENCE_RULES, 'CAUR-RESTART-ALWAYS').check(unit)).not.toBeNull();
  });

  it.each([
    ['CAUR-RESTART-ALWAYS', 'RestartSec=2s'],
    ['CAUR-RESTART-ALWAYS', 'Restart=on-failure'],
    ['CAUR-RESTART-ALWAYS', 'Restart=always'],
    ['CAUR-RESTART-ALWAYS', 'RestartSec=120'],
    ['PERSIST-001', 'echo "  sudo systemctl enable --now vopono.service"'],
    ['PERSIST-004', 'echo -e "Please restart your terminal or run source /etc/profile"'],
  ])('does not flag %s for %j', (id, line) => {
    expect(ruleById(PERSISTENCE_RULES, id).check(makeChange(addedOnlyDiff([line])))).toBeNull();
  });

  it('does not flag systemctl instructions inside documentation files', () => {
    const change = makeChange(addedOnlyDiff(['systemctl --user enable --now pcloudcc@user.service']), {
      new_path: 'pcloudcc/pcloudcc-systemd.md',
    });
    expect(ruleById(PERSISTENCE_RULES, 'PERSIST-001').check(change)).toBeNull();
  });

  it('does not flag profile.d files shipped inside the package', () => {
    const change = makeChange(
      addedOnlyDiff(['install -Dm755 "$srcdir/$pkgname.sh" "$pkgdir/etc/profile.d/$pkgname.sh"']),
    );
    expect(ruleById(PERSISTENCE_RULES, 'PERSIST-004').check(change)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { DESTRUCTIVE_RULES } from './destructive.rules';
import { addedOnlyDiff, makeChange, ruleById } from './test-support';

const rule = () => ruleById(DESTRUCTIVE_RULES, 'CAUR-DESTRUCTIVE');

describe('destructive rules', () => {
  it.each([
    ['rm -rf /'],
    ['rm -fr /*'],
    ['rm -r --force "$HOME"/.cache'],
    ['rm -rf /etc/pacman.d/gnupg'],
    ['rm -rf ~/snap'],
    ['mkfs.ext4 /dev/sda'],
    ['dd if=/dev/zero of=/dev/sda bs=1M count=10'],
    ['wipefs -a /dev/sdb'],
  ])('flags %j in any file', (line) => {
    expect(rule().check(makeChange(addedOnlyDiff([line])))).not.toBeNull();
  });

  it('flags any recursive rm inside install scriptlets, which run as root', () => {
    const change = makeChange(addedOnlyDiff(['pre_upgrade() {', '  rm -r /tmp/cache', '}']), {
      new_path: 'foo/foo.install',
    });
    expect(rule().check(change)).not.toBeNull();

    const relativeTarget = makeChange(addedOnlyDiff(['rm -rf build build2']), {
      new_path: 'foo/foo.install',
    });
    expect(rule().check(relativeTarget)).not.toBeNull();
  });

  it.each([
    ['rm -rf "$pkgdir"'],
    ['rm -rf build'],
    ['rm -rf build build2'],
    ['rm -r "$srcdir"/ leftovers'],
    ['rm /tmp/notes.txt'],
  ])('does not flag %j outside sensitive targets', (line) => {
    expect(rule().check(makeChange(addedOnlyDiff([line])))).toBeNull();
  });
});

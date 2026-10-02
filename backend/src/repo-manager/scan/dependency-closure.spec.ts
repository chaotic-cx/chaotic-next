import { describe, expect, it } from 'vitest';
import { DependencyClosure } from './dependency-closure';

const CLOSURE = new DependencyClosure([
  { pkgname: 'clang', deps: ['llvm-libs=23.1.1', 'gcc'], provides: [] },
  { pkgname: 'llvm-libs', deps: ['libffi'], provides: ['libLLVM.so=23.1-64'] },
  { pkgname: 'llvm22-libs', deps: [], provides: ['libLLVM.so=22.1-64'] },
  { pkgname: 'clang22', deps: ['llvm22-libs'], provides: [] },
  { pkgname: 'libffi', deps: [], provides: [] },
  { pkgname: 'gcc', deps: [], provides: [] },
]);

describe('DependencyClosure.reachablePackages', () => {
  it('follows dependencies transitively and ignores version constraints', () => {
    expect(CLOSURE.reachablePackages(['clang>=23'])).toEqual(new Set(['clang', 'llvm-libs', 'libffi', 'gcc']));
  });

  it('does not reach a compat package that nothing depends on', () => {
    expect(CLOSURE.reachablePackages(['clang']).has('llvm22-libs')).toBe(false);
  });

  it('reaches a compat package pulled in by a dependency', () => {
    expect(CLOSURE.reachablePackages(['clang22']).has('llvm22-libs')).toBe(true);
  });

  it('resolves a dependency through the provides entries of every provider', () => {
    expect(CLOSURE.reachablePackages(['libLLVM.so'])).toEqual(new Set(['llvm-libs', 'llvm22-libs', 'libffi']));
  });

  it('returns nothing for unknown dependencies', () => {
    expect(CLOSURE.reachablePackages(['not-a-package'])).toEqual(new Set());
  });
});

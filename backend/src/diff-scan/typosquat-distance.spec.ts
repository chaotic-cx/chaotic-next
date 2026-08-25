import { describe, expect, it } from 'vitest';
import { closestKnownName, normalizePackageName } from './typosquat';

function referenceLevenshtein(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const ALPHABET = 'abc0-';
let seed = 42;
const nextLength = (max: number): number => (seed = (seed * 1103515245 + 12345) % 2147483648) % (max + 1);
const nextChar = (): string => ALPHABET[(seed = (seed * 1103515245 + 12345) % 2147483648) % ALPHABET.length];
const randomName = (): string => {
  const length = 1 + nextLength(11);
  let name = '';
  for (let index = 0; index < length; index++) name += index === length - 1 ? 'q'[0] : nextChar();
  return name.replace(/^-+/, '');
};

describe('boundedEditDistance via closestKnownName', () => {
  it('matches a reference Levenshtein on 800 random pairs', () => {
    let compared = 0;
    for (let iteration = 0; iteration < 400; iteration++) {
      const pkgName = randomName();
      const knownName = randomName();
      const normalizedPkg = normalizePackageName(pkgName);
      const normalizedKnown = normalizePackageName(knownName);
      if (normalizedPkg.length === 0 || normalizedKnown.length === 0 || normalizedPkg === normalizedKnown) continue;

      const expected = referenceLevenshtein(normalizedPkg, normalizedKnown);
      const bound = Math.min(normalizedPkg.length, normalizedKnown.length) < 8 ? 1 : 2;
      const hit = closestKnownName(pkgName, new Set([knownName]));

      if (expected <= bound) {
        expect(hit, `${pkgName} vs ${knownName} (ref ${expected}, bound ${bound})`).toEqual({
          knownName,
          distance: expected,
        });
      } else {
        expect(hit, `${pkgName} vs ${knownName} (ref ${expected} > bound ${bound})`).toBeNull();
      }
      compared++;
    }
    expect(compared).toBeGreaterThan(300);
  });

  it('keeps textbook distances', () => {
    // kitten -> sitting needs 3 edits; both lengths < 8, so bound 1 rejects it.
    expect(closestKnownName('kitten', new Set(['sitting']))).toBeNull();

    // Length >= 8 pairs surface the true distance value while it fits the bound.
    const left = 'kittenpicker';
    const right = 'kittenlicker';
    expect(closestKnownName(left, new Set([right]))?.distance).toBe(referenceLevenshtein(left, right));

    // A single adjacent transposition costs plain Levenshtein 2 edits.
    expect(closestKnownName('chromuim-bin', new Set(['chromium'])))?.toEqual({
      knownName: 'chromium',
      distance: 2,
    });
  });
});

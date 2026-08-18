import { describe, expect, it } from 'vitest';
import { diffWords } from './word-diff';

describe('diffWords', () => {
  it('flags only the changed token of a version bump', () => {
    const { removed, added } = diffWords('pkgver=1.2.2', 'pkgver=1.2.3');
    expect(segmentsText(removed)).toEqual(['pkgver=1.2.', '2']);
    expect(segmentsText(added)).toEqual(['pkgver=1.2.', '3']);
    expect(changedText(added)).toEqual(['3']);
  });

  it('keeps unchanged lines free of changed segments', () => {
    const { removed, added } = diffWords('install -Dm755 app /usr/bin/app', 'install -Dm755 app /usr/bin/app');
    expect(changedText(added)).toEqual([]);
    expect(changedText(removed)).toEqual([]);
  });

  it('flags an appended token as the only change', () => {
    const { added } = diffWords('echo foo', 'echo foo bar');
    expect(changedText(added)).toEqual(['bar']);
  });

  it('flags a renamed suffix only', () => {
    const { added } = diffWords('install app /usr/bin/app', 'install app /usr/bin/app.new');
    expect(changedText(added)).toEqual(['.new']);
  });
});

function segmentsText(segments: { text: string }[]): string[] {
  return segments.map((segment) => segment.text);
}

function changedText(segments: { text: string; changed: boolean }[]): string[] {
  return segments.filter((segment) => segment.changed).map((segment) => segment.text);
}

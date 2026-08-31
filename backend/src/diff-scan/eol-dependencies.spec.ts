import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkEolDependencies,
  matchesCycle,
  parseDependencyConstraint,
  productForDependency,
} from './eol-dependencies';

const CYCLES = {
  result: {
    releases: [
      { name: '3.14', isEol: false, eolFrom: '2030-10-31' },
      { name: '3.12', isEol: false, eolFrom: '2028-10-01' },
      { name: '3.9', isEol: true, eolFrom: '2025-10-31' },
      { name: '4.0', isEol: false, eolFrom: '2027-01-01' },
    ],
  },
};

const ELECTRON_CYCLES = {
  result: {
    releases: [
      { name: '37', isEol: true, eolFrom: '2025-09-02' },
      { name: '39', isEol: true, eolFrom: '2026-06-16' },
      { name: '43', isEol: false, eolFrom: null },
    ],
  },
};

function stubFetch(payload: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(JSON.stringify(payload)) }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('parseDependencyConstraint', () => {
  it('extracts name, operator, and version', () => {
    expect(parseDependencyConstraint('python>=3.9')).toEqual({
      clean: 'python>=3.9',
      name: 'python',
      op: '>=',
      version: '3.9',
    });
    expect(parseDependencyConstraint('postgresql=16.1')).toEqual({
      clean: 'postgresql=16.1',
      name: 'postgresql',
      op: '=',
      version: '16.1',
    });
  });

  it('returns no operator and version for unversioned dependencies', () => {
    expect(parseDependencyConstraint('nettle')).toEqual({ clean: 'nettle', name: 'nettle', op: null, version: null });
  });
});

describe('productForDependency', () => {
  it('maps known dependency names to products', () => {
    expect(productForDependency('python')).toBe('python');
    expect(productForDependency('postgresql-libs')).toBe('postgresql');
    expect(productForDependency('electron19')).toBe('electron');
    expect(productForDependency('java-runtime')).toBe('java');
  });

  it('leaves unknown dependency names unmapped', () => {
    expect(productForDependency('nettle')).toBeNull();
  });
});

describe('matchesCycle', () => {
  it('matches version prefixes numerically', () => {
    expect(matchesCycle('3.9.12', '3.9')).toBe(true);
    expect(matchesCycle('3.10.1', '3.9')).toBe(false);
    expect(matchesCycle('17.0.1', '17')).toBe(true);
  });
});

describe('checkEolDependencies', () => {
  it('reports an exact pin to an end-of-life cycle', async () => {
    stubFetch(CYCLES);
    const text = "depends=('nettle' 'python=3.9')";
    const findings = await checkEolDependencies(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'CAUR-EOL-DEP',
      severity: 'warning',
      file: 'PKGBUILD',
      match: 'python=3.9',
    });
    expect(findings[0]?.description).toContain('2025-10-31');
  });

  it('reports a name-encoded electron major, with or without constraints', async () => {
    stubFetch(ELECTRON_CYCLES);
    const findings = await checkEolDependencies("depends=('electron37' 'gtk3')");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: 'CAUR-EOL-DEP', severity: 'warning', match: 'electron37' });

    const constrained = await checkEolDependencies("depends=('electron39>=39.0.0' 'electron39<40.0.0')");
    expect(constrained).toHaveLength(2);
    expect(constrained[0]?.description).toContain('end of life');
  });

  it('never flags a version floor like >=, because builds resolve to newer versions', async () => {
    stubFetch(CYCLES);
    const text = "depends=('python>=3.9')";
    expect(await checkEolDependencies(text)).toHaveLength(0);
  });

  it('accepts dependencies on supported cycles', async () => {
    stubFetch(CYCLES);
    const text = "depends=('python>=3.13')";
    expect(await checkEolDependencies(text)).toHaveLength(0);
  });

  it('ignores unversioned and unknown dependencies', async () => {
    stubFetch(CYCLES);
    const text = "depends=('nettle' 'python')";
    expect(await checkEolDependencies(text)).toHaveLength(0);
  });

  it('reports nothing when the feed is unavailable', async () => {
    // postgresql is not loaded by earlier tests in this file; the memoized
    // python loader would otherwise answer before the stub can fail.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const text = "depends=('postgresql>=9.3')";
    expect(await checkEolDependencies(text)).toHaveLength(0);
  });
});

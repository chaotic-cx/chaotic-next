import { describe, expect, it } from 'vitest';
import { maintainerSince, maintainerSummary, tookOverByNovice, vtEngines } from './scan-presenter';
import type { AurMaintainerInfo } from '@chaotic-next/shared-lib';

function maintainer(overrides: Partial<AurMaintainerInfo> = {}): AurMaintainerInfo {
  return {
    username: 'garudalinux',
    packagesMaintained: 21,
    totalVotes: 127,
    registeredDate: '2023-12-29T00:00:00.000Z',
    novice: false,
    ...overrides,
  };
}

describe('maintainerSince', () => {
  it('renders registration month and year, not only the year', () => {
    expect(maintainerSince(maintainer())).toMatch(/\p{L}+\s?2023/u);
  });
});

describe('maintainerSummary', () => {
  it('keeps package and vote counts next to the registration date', () => {
    const summary = maintainerSummary(maintainer({ packagesMaintained: 3, totalVotes: 9 }));
    expect(summary).toContain('3 package(s)');
    expect(summary).toMatch(/since \p{L}+\s?2023/u);
    expect(summary).toContain('9 votes');
  });
});

describe('vtEngines', () => {
  it('reports flagged engines of the available total', () => {
    expect(
      vtEngines({
        type: 'url',
        value: 'https://example.com',
        context: '',
        verdict: 'suspicious',
        stats: { malicious: 1, suspicious: 2, harmless: 57, undetected: 0, timeout: 0 },
      }),
    ).toBe('3/60 engines flagged');
  });

  it('states when engine data is missing', () => {
    expect(vtEngines({ type: 'url', value: 'https://example.com', context: '', verdict: 'unknown' })).toBe(
      'no engine data',
    );
  });
});

describe('tookOverByNovice', () => {
  it('detects when an added maintainer is a novice', () => {
    const maintainers = [maintainer({ username: 'newbie', novice: true })];
    expect(tookOverByNovice({ added: ['newbie'], removed: [], previous: [], detectedAt: '' }, maintainers)).toBe(true);
  });

  it('is false for established maintainers', () => {
    expect(
      tookOverByNovice({ added: ['garudalinux'], removed: [], previous: [], detectedAt: '' }, [maintainer()]),
    ).toBe(false);
  });
});

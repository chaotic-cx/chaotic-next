import { describe, expect, it } from 'vitest';
import {
  findingCount,
  maintainerChangeSummary,
  maintainerSince,
  maintainerSummary,
  tookOverByNovice,
  vtEngines,
} from './scan-presenter';
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

  it('returns null for an invalid registration date', () => {
    expect(maintainerSince(maintainer({ registeredDate: 'not a date' }))).toBeNull();
  });
});

describe('maintainerSummary', () => {
  it('keeps package and vote counts next to the registration date', () => {
    const summary = maintainerSummary(maintainer({ packagesMaintained: 3, totalVotes: 9 }));

    expect(summary.key).toBe('aurScan.maintainers.summary');
    expect(summary.params).toMatchObject({ packages: 3, votes: 9 });
    expect(summary.params?.['since']).toMatch(/\p{L}+\s?2023/u);
  });

  it('uses the unknown-date text for an invalid registration date', () => {
    const summary = maintainerSummary(
      maintainer({ registeredDate: 'not a date', packagesMaintained: 3, totalVotes: 9 }),
    );

    expect(summary).toEqual({ key: 'aurScan.maintainers.summaryUnknownSince', params: { packages: 3, votes: 9 } });
  });
});

describe('maintainerChangeSummary', () => {
  it('lists added and removed maintainers with the detection date', () => {
    const summary = maintainerChangeSummary({
      added: ['newbie'],
      removed: ['garudalinux', 'other'],
      previous: [],
      detectedAt: '2024-03-05T00:00:00.000Z',
    });

    expect(summary?.key).toBe('aurScan.maintainerChange.summary');
    expect(summary?.params?.['changes']).toBe('+newbie -garudalinux, other');
  });

  it('returns null when nothing changed', () => {
    expect(maintainerChangeSummary({ added: [], removed: [], previous: [], detectedAt: '' })).toBeNull();
  });
});

describe('findingCount', () => {
  it('uses the singular key for one finding', () => {
    expect(findingCount(1)).toEqual({ key: 'aurScan.findingCountOne', params: { count: 1 } });
  });

  it('uses the plural key for other counts', () => {
    expect(findingCount(3)).toEqual({ key: 'aurScan.findingCountOther', params: { count: 3 } });
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
    ).toEqual({ key: 'aurScan.vt.enginesFlagged', params: { flagged: 3, total: 60 } });
  });

  it('states when engine data is missing', () => {
    expect(vtEngines({ type: 'url', value: 'https://example.com', context: '', verdict: 'unknown' })).toEqual({
      key: 'aurScan.vt.noEngineData',
    });
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

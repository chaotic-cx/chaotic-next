import { describe, expect, it } from 'vitest';
import { addRecentSearch, RECENT_SEARCHES_LIMIT } from './recent-searches.service';

describe('addRecentSearch', () => {
  it('puts the new name first', () => {
    expect(addRecentSearch(['mesa-git', 'firefox-nightly'], 'paru')).toEqual(['paru', 'mesa-git', 'firefox-nightly']);
  });

  it('moves a repeated name to the front instead of listing it twice', () => {
    expect(addRecentSearch(['mesa-git', 'paru', 'firefox-nightly'], 'paru')).toEqual([
      'paru',
      'mesa-git',
      'firefox-nightly',
    ]);
  });

  it('drops the oldest name above the limit', () => {
    const full = [...Array(RECENT_SEARCHES_LIMIT).keys()].map((index) => `pkg-${index}`);
    const next = addRecentSearch(full, 'new-pkg');

    expect(next).toHaveLength(RECENT_SEARCHES_LIMIT);
    expect(next[0]).toBe('new-pkg');
    expect(next).not.toContain(`pkg-${RECENT_SEARCHES_LIMIT - 1}`);
  });
});

import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { isLogPurged, loadingWithoutValue, retainedResourceValue, sameItems, vtIndicatorLink } from './functions';

describe('vtIndicatorLink', () => {
  it('passes file hashes through unchanged', () => {
    expect(vtIndicatorLink({ type: 'file', value: 'abc123' })).toBe('https://www.virustotal.com/gui/file/abc123');
  });

  it('routes URL indicators through the search endpoint with an encoded query', () => {
    expect(vtIndicatorLink({ type: 'url', value: 'https://evil.example/payload.sh' })).toBe(
      'https://www.virustotal.com/gui/search?query=https%3A%2F%2Fevil.example%2Fpayload.sh',
    );
  });
});

describe('isLogPurged', () => {
  const NOW = Date.parse('2026-08-25T12:00:00.000Z');
  const DAY_MS = 24 * 60 * 60 * 1000;

  it('marks builds older than the retention window as purged', () => {
    expect(isLogPurged(new Date(NOW - 8 * DAY_MS).toISOString(), NOW)).toBe(true);
  });

  it('keeps builds within the retention window available', () => {
    expect(isLogPurged(new Date(NOW - 6 * DAY_MS).toISOString(), NOW)).toBe(false);
  });

  it('accepts Date instances', () => {
    expect(isLogPurged(new Date(NOW - 8 * DAY_MS), NOW)).toBe(true);
  });

  it('treats an unparseable timestamp as not purged', () => {
    expect(isLogPurged('not-a-date', NOW)).toBe(false);
  });
});

function fakeResource<T>(initial: T | undefined) {
  const value = signal<T | undefined>(initial);
  const loading = signal(false);
  return {
    value,
    loading,
    resource: {
      hasValue: () => value() !== undefined,
      value: () => value() as T,
      isLoading: () => loading(),
    },
  };
}

describe('retainedResourceValue', () => {
  it('keeps the last value while the resource has none', () => {
    const fake = fakeResource<string>('first page');
    const retained = retainedResourceValue(fake.resource);
    expect(retained()).toBe('first page');

    fake.value.set(undefined);
    expect(retained()).toBe('first page');

    fake.value.set('second page');
    expect(retained()).toBe('second page');
  });
});

describe('loadingWithoutValue', () => {
  it('reports loading only while nothing is available to show', () => {
    const fake = fakeResource<string>(undefined);
    const retained = retainedResourceValue(fake.resource);
    const loading = loadingWithoutValue(fake.resource, retained);

    fake.loading.set(true);
    expect(loading()).toBe(true);

    fake.value.set('rows');
    expect(loading()).toBe(false);

    fake.value.set(undefined);
    expect(loading()).toBe(false);
  });
});

describe('sameItems', () => {
  it('treats new arrays with the same items in the same order as equal', () => {
    expect(sameItems(['firedragon', 'paru'], ['firedragon', 'paru'])).toBe(true);
  });

  it('detects a changed order, a changed item and a changed length', () => {
    expect(sameItems(['firedragon', 'paru'], ['paru', 'firedragon'])).toBe(false);
    expect(sameItems(['firedragon'], ['paru'])).toBe(false);
    expect(sameItems(['firedragon'], ['firedragon', 'paru'])).toBe(false);
  });
});

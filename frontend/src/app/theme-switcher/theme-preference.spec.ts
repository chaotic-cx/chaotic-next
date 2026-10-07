import { parseThemePreference, resolveFlavour } from './theme-preference';

describe('parseThemePreference', () => {
  it('keeps a known preference', () => {
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
  });

  it('falls back to the system setting for missing or unknown values', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('sepia')).toBe('system');
  });
});

describe('resolveFlavour', () => {
  it('follows an explicit choice, whatever the system setting is', () => {
    expect(resolveFlavour('light', true)).toBe('latte');
    expect(resolveFlavour('dark', false)).toBe('mocha');
  });

  it('follows the system setting for the system preference', () => {
    expect(resolveFlavour('system', true)).toBe('mocha');
    expect(resolveFlavour('system', false)).toBe('latte');
  });
});

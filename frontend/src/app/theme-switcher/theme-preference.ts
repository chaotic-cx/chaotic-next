import { DARK_FLAVOUR, type Flavour, LIGHT_FLAVOUR } from '../theme';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

// The pre-boot script in index.html reads the same key. Change both together.
export const THEME_STORAGE_KEY = 'theme';

const DEFAULT_PREFERENCE: ThemePreference = 'system';

function isThemePreference(value: string | null): value is ThemePreference {
  return value !== null && THEME_PREFERENCES.includes(value as ThemePreference);
}

/**
 * Turns a stored value into a preference.
 * Unknown or missing values fall back to the system setting.
 */
export function parseThemePreference(value: string | null): ThemePreference {
  if (isThemePreference(value)) {
    return value;
  }

  return DEFAULT_PREFERENCE;
}

export function resolveFlavour(preference: ThemePreference, systemPrefersDark: boolean): Flavour {
  if (preference === 'light') {
    return LIGHT_FLAVOUR;
  }

  if (preference === 'dark') {
    return DARK_FLAVOUR;
  }

  if (systemPrefersDark) {
    return DARK_FLAVOUR;
  }

  return LIGHT_FLAVOUR;
}

export function readStoredThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

/**
 * Remembers the theme that the user picked.
 * Private windows can block storage, so the choice then lasts only for this visit.
 */
export function storeThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage is not available.
  }
}

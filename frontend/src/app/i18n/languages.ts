import { getBrowserLang } from '@jsverse/transloco';

export const DEFAULT_LANGUAGE = 'en';

const GERMAN_LANGUAGE = 'de';

export const AVAILABLE_LANGUAGES: readonly string[] = [DEFAULT_LANGUAGE, GERMAN_LANGUAGE];

const LANGUAGE_STORAGE_KEY = 'language';

function readStoredLanguage(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Remembers the language that the user picked.
 * Private windows can block storage, so the choice then lasts only for this visit.
 */
export function storeLanguage(language: string): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage is not available.
  }
}

/**
 * Picks the stored language, then the browser language, then the default language.
 */
export function resolveInitialLanguage(): string {
  const candidates = [readStoredLanguage(), getBrowserLang() ?? null];
  const supported = candidates.find((candidate) => candidate !== null && AVAILABLE_LANGUAGES.includes(candidate));

  return supported ?? DEFAULT_LANGUAGE;
}

import { DestroyRef, inject, Service, signal } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { DARK_FLAVOUR, flavour, type Flavour, LIGHT_FLAVOUR, setActiveFlavour } from '../theme';
import {
  readStoredThemePreference,
  resolveFlavour,
  storeThemePreference,
  type ThemePreference,
} from './theme-preference';

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

// PrimeNG switches its dark tokens with this class (darkModeSelector in app.config.ts).
const DARK_MODE_CLASS = 'dark-mode';

const COLOR_SCHEME: Record<Flavour, string> = {
  latte: 'light',
  mocha: 'dark',
};

const THEME_COLOR: Record<Flavour, string> = {
  latte: flavors.latte.colors.mauve.hex,
  mocha: flavors.mocha.colors.mauve.hex,
};

/**
 * Applies a flavour to <html>: the palette class, the PrimeNG dark class,
 * the native colour scheme and the browser theme colour.
 */
function applyFlavourToDocument(next: Flavour): void {
  const root = document.documentElement;
  const isDark = next === DARK_FLAVOUR;

  root.classList.toggle(DARK_FLAVOUR, isDark);
  root.classList.toggle(LIGHT_FLAVOUR, !isDark);
  root.classList.toggle(DARK_MODE_CLASS, isDark);
  root.style.colorScheme = COLOR_SCHEME[next];

  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeColorMeta?.setAttribute('content', THEME_COLOR[next]);
}

/**
 * Holds the theme preference (system, light or dark) and keeps the page flavour in sync with it.
 * With the system preference, the flavour follows the operating system setting live.
 */
@Service()
export class ThemeService {
  private readonly darkScheme = window.matchMedia(DARK_SCHEME_QUERY);

  private readonly currentPreference = signal<ThemePreference>(readStoredThemePreference());

  readonly preference = this.currentPreference.asReadonly();

  readonly flavour = flavour;

  constructor() {
    const onSchemeChange = (): void => this.apply();
    this.darkScheme.addEventListener('change', onSchemeChange);
    inject(DestroyRef).onDestroy(() => this.darkScheme.removeEventListener('change', onSchemeChange));

    this.apply();
  }

  setPreference(preference: ThemePreference): void {
    storeThemePreference(preference);
    this.currentPreference.set(preference);
    this.apply();
  }

  private apply(): void {
    const next = resolveFlavour(this.currentPreference(), this.darkScheme.matches);
    applyFlavourToDocument(next);
    setActiveFlavour(next);
  }
}

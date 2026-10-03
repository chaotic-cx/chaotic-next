import { signal } from '@angular/core';
import { type AccentName, type CatppuccinColors, flavors } from '@catppuccin/palette';

export type Flavour = 'latte' | 'mocha';

export const LIGHT_FLAVOUR: Flavour = 'latte';
export const DARK_FLAVOUR: Flavour = 'mocha';

/**
 * Reads the flavour class that the pre-boot script in index.html sets on <html>.
 * Without that class, the app starts in the dark flavour.
 */
function documentFlavour(): Flavour {
  if (document.documentElement.classList.contains(LIGHT_FLAVOUR)) {
    return LIGHT_FLAVOUR;
  }

  return DARK_FLAVOUR;
}

const activeFlavour = signal<Flavour>(documentFlavour());

/**
 * The flavour on screen. Charts, the map and the terminal read it,
 * so they re-theme when it changes. Only the ThemeService writes it.
 */
export const flavour = activeFlavour.asReadonly();

export function setActiveFlavour(next: Flavour): void {
  activeFlavour.set(next);
}

/**
 * The Catppuccin colours of the active flavour.
 * A computed() or template that calls this re-runs when the flavour changes.
 */
export function themePalette(): CatppuccinColors {
  return flavors[flavour()].colors;
}

const SERIES_COLOR_NAMES: readonly AccentName[] = [
  'blue',
  'green',
  'lavender',
  'maroon',
  'mauve',
  'peach',
  'pink',
  'red',
  'rosewater',
  'sapphire',
  'sky',
  'teal',
  'yellow',
];

export function paletteColor(name: AccentName): string {
  return themePalette()[name].hex;
}

/**
 * The colour for series number `index`. The list of names repeats when there are more series than names.
 */
export function cycledColor(names: readonly AccentName[], index: number): string {
  return paletteColor(names[index % names.length]);
}

/**
 * One colour per chart series, in a fixed order, from the active flavour.
 */
export function seriesColors(): string[] {
  const colors: string[] = [];
  for (const name of SERIES_COLOR_NAMES) {
    colors.push(paletteColor(name));
  }

  return colors;
}

export function seriesColor(index: number): string {
  return cycledColor(SERIES_COLOR_NAMES, index);
}

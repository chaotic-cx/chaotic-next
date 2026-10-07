import { inject, Pipe, PipeTransform } from '@angular/core';
import { type BuildClassTierName, buildClassTierName, parseBuildClass } from '@chaotic-next/shared-lib';
import { TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { injectActiveLanguage } from './active-language';

const TIER_KEYS: Record<BuildClassTierName, string> = {
  'None': marker('pipes.buildClass.tier.none'),
  'Light': marker('pipes.buildClass.tier.light'),
  'Medium': marker('pipes.buildClass.tier.medium'),
  'Heavy': marker('pipes.buildClass.tier.heavy'),
  'Very Heavy': marker('pipes.buildClass.tier.veryHeavy'),
};

const CUSTOM_KEY = marker('pipes.buildClass.custom');
const LABEL_KEY = marker('pipes.buildClass.label');

/**
 * Translated label, e.g. "9 (Very Heavy)".
 * Custom classes stay as they are.
 */
export function translateBuildClass(value: null | number | string, transloco: TranslocoService): string {
  if (value === null) return transloco.translate(CUSTOM_KEY);

  const buildClass = parseBuildClass(value);
  if (buildClass === null) return String(value);

  const tier = transloco.translate(TIER_KEYS[buildClassTierName(buildClass)]);
  return transloco.translate(LABEL_KEY, { buildClass, tier });
}

/**
 * Impure, so the label follows a language change.
 * Reading the active language signal marks the view for a refresh.
 */
@Pipe({ name: 'buildClass', pure: false })
export class BuildClassPipe implements PipeTransform {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = injectActiveLanguage();

  transform(value: null | number | string): string {
    this.activeLanguage();

    return translateBuildClass(value, this.transloco);
  }
}

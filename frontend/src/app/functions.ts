import { computed, type Signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import type { ChaoticEvent } from '@chaotic-next/shared-lib';

const CHAOTIC_EVENT_TYPES = new Set(['build', 'pipeline', 'merge_request', 'queue']);

export const PACKAGE_NAME_PATTERN = /^[a-zA-Z0-9@.+_-]+$/;

export function isChaoticEvent(value: unknown): value is ChaoticEvent {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type: unknown }).type;
  return typeof type === 'string' && CHAOTIC_EVENT_TYPES.has(type);
}

export function shuffleArray<T>(array: readonly T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i >= 0; i--) {
    const j: number = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

export function castTo<T>(value: unknown): T {
  return value as T;
}

export function range(count: number): number[] {
  return Array.from({ length: count }, (ignored, index) => index + 1);
}

export function parseCount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function packageLogRouteFromUrl(logUrl: string): string[] {
  try {
    const url = new URL(logUrl);
    const pkgname = url.searchParams.get('id');
    const timestamp = url.searchParams.get('timestamp');
    if (pkgname && timestamp) return ['/logs/package', pkgname, timestamp];
  } catch {
    // Malformed log URL; fall through to an empty (no-op) route.
  }
  return [];
}

export function resourceValue<T>(resource: { hasValue(): boolean; value(): T }): T | undefined {
  return resource.hasValue() ? resource.value() : undefined;
}

export function resourceSignal<T>(resource: { hasValue(): boolean; value(): T }): Signal<T | undefined> {
  return computed(() => resourceValue(resource));
}

export interface SeoTags {
  title: string;
  description: string;
  keywords: string;
  url: string;
  image?: string;
}

export function updateSeoTags(meta: Meta, seo: SeoTags): void {
  meta.updateTag({ name: 'description', content: seo.description });
  meta.updateTag({ name: 'keywords', content: seo.keywords });
  meta.updateTag({ property: 'og:title', content: seo.title });
  meta.updateTag({ property: 'og:description', content: seo.description });
  meta.updateTag({ property: 'og:url', content: seo.url });
  if (seo.image) meta.updateTag({ property: 'og:image', content: seo.image });
}

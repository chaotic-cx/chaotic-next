import { BreakpointObserver } from '@angular/cdk/layout';
import { computed, DestroyRef, inject, signal, type Signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import type { ParamMap } from '@angular/router';
import type { ChaoticEvent, GitlabLogChunk } from '@chaotic-next/shared-lib';
import { debounceTime, distinctUntilChanged } from 'rxjs';

const CHAOTIC_EVENT_TYPES = new Set(['build', 'pipeline', 'merge_request', 'queue', 'queue_promoted']);

export function vtIndicatorLink(indicator: { type: string; value: string }): string {
  if (indicator.type !== 'url') {
    return `https://www.virustotal.com/gui/file/${indicator.value}`;
  }
  return `https://www.virustotal.com/gui/search?query=${encodeURIComponent(indicator.value)}`;
}

export function parseLogChunk(data: string): GitlabLogChunk | undefined {
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value !== 'object' || value === null) return undefined;
    const partial = value as Partial<GitlabLogChunk>;
    if (typeof partial.text !== 'string') return undefined;
    return {
      offset: partial.offset ?? 0,
      text: partial.text,
      complete: partial.complete === true,
      status: partial.status ?? '',
    };
  } catch {
    return undefined;
  }
}

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

export function parseCount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseFocusQuery(params: ParamMap): [number, number] | null {
  const raw = params.get('focus');
  if (!raw) return null;
  const [lat, lon] = raw.split(',').map(Number);
  if (![lat, lon].every(Number.isFinite)) return null;
  return [lon, lat];
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatDuration(totalSeconds: number): string {
  // Sub-second precision is noise in a human-readable duration; round before
  // splitting so the seconds part never carries over into 60.
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return 'n/a';
  let value = Math.abs(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const sign = bytes < 0 ? '-' : '';
  return unitIndex === 0
    ? `${sign}${value} ${BYTE_UNITS[unitIndex]}`
    : `${sign}${value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`;
}

const NANOSECONDS_PER_SECOND = 1_000_000_000;

export function formatCpuTime(nanoseconds: number): string {
  if (!Number.isFinite(nanoseconds)) return 'n/a';
  return formatDuration(nanoseconds / NANOSECONDS_PER_SECOND);
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

/**
 * Build logs are deleted this long after their build; mirrors the backend retention.
 * TODO: change to 1 months on 28.09.
 */
export const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function isLogPurged(timestamp: string | Date, nowMs: number = Date.now()): boolean {
  const builtAtMs = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp.getTime();
  return !Number.isNaN(builtAtMs) && builtAtMs + LOG_RETENTION_MS < nowMs;
}

export function resourceValue<T>(resource: { hasValue(): boolean; value(): T }): T | undefined {
  return resource.hasValue() ? resource.value() : undefined;
}

export function debouncedSignal<T>(source: Signal<T>, delayMs: number): Signal<T> {
  return toSignal(toObservable(source).pipe(debounceTime(delayMs), distinctUntilChanged()), {
    initialValue: source(),
  });
}

export function resourceSignal<T>(resource: { hasValue(): boolean; value(): T }): Signal<T | undefined> {
  return computed(() => resourceValue(resource));
}

export function copyLineLink(line: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set('line', String(line));
  void navigator.clipboard.writeText(url.toString());
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

const MOBILE_BREAKPOINT = '(max-width: 768px)';
const MAX_LABEL_LENGTH = 15;

export function isMobileSignal(): Signal<boolean> {
  const observer = inject(BreakpointObserver);
  const destroyRef = inject(DestroyRef);
  const result = signal(false);
  observer
    .observe(MOBILE_BREAKPOINT)
    .pipe(takeUntilDestroyed(destroyRef))
    .subscribe((state) => result.set(state.matches));
  return result.asReadonly();
}

export function truncateLabel(label: string, maxLength: number = MAX_LABEL_LENGTH): string {
  return label.length > maxLength ? `${label.substring(0, maxLength)}…` : label;
}

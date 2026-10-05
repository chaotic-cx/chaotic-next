import { Service, signal } from '@angular/core';

const RECENT_SEARCHES_STORAGE_KEY = 'chaotic.recentPackageSearches';
export const RECENT_SEARCHES_LIMIT = 6;

/** Puts the name first, removes an earlier copy of it and keeps at most the limit. */
export function addRecentSearch(names: readonly string[], name: string): string[] {
  const others = names.filter((existing) => existing !== name);
  return [name, ...others].slice(0, RECENT_SEARCHES_LIMIT);
}

function readStoredSearches(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];

    return stored.filter((name): name is string => typeof name === 'string').slice(0, RECENT_SEARCHES_LIMIT);
  } catch {
    return [];
  }
}

function storeSearches(names: readonly string[]): void {
  // Private windows and blocked site data reject storage. The list then lasts for this visit only.
  try {
    localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(names));
  } catch {
    return;
  }
}

/**
 * The packages that this browser opened last on the search page, newest first.
 * Only packages that loaded go into the list, so typos and unknown names stay out of it.
 */
@Service()
export class RecentSearchesService {
  private readonly names = signal<string[]>(readStoredSearches());

  readonly recent = this.names.asReadonly();

  add(name: string): void {
    if (this.names()[0] === name) return;

    this.update(addRecentSearch(this.names(), name));
  }

  remove(name: string): void {
    this.update(this.names().filter((existing) => existing !== name));
  }

  clear(): void {
    this.update([]);
  }

  private update(names: string[]): void {
    this.names.set(names);
    storeSearches(names);
  }
}

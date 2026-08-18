import { Service, type Signal, type WritableSignal, signal } from '@angular/core';

const STORAGE_KEY = 'chaotic-column-visibility';

@Service()
export class ColumnVisibilityService {
  private readonly defaults = new Map<string, string[]>();
  private readonly states = new Map<string, WritableSignal<Set<string>>>();

  register(tableKey: string, columns: string[]): void {
    if (this.states.has(tableKey)) return;
    this.defaults.set(tableKey, columns);
    const saved = this.read()[tableKey];
    this.states.set(tableKey, signal(new Set(saved ?? columns)));
  }

  visible(tableKey: string): Signal<Set<string>> {
    const state = this.states.get(tableKey);
    if (!state) throw new Error(`Table "${tableKey}" has not been registered with ColumnVisibilityService`);
    return state;
  }

  isVisible(tableKey: string, column: string): boolean {
    return this.states.get(tableKey)?.().has(column) ?? false;
  }

  toggle(tableKey: string, column: string): void {
    const state = this.states.get(tableKey);
    if (!state) return;
    state.update((current) => {
      const next = new Set(current);
      if (next.has(column)) next.delete(column);
      else next.add(column);
      return next;
    });
    this.write(tableKey, [...state()]);
  }

  replace(tableKey: string, columns: string[]): void {
    const state = this.states.get(tableKey);
    if (!state) return;
    state.set(new Set(columns));
    this.write(tableKey, columns);
  }

  private read(): Record<string, string[]> {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    } catch {
      return {};
    }
  }

  private write(tableKey: string, columns: string[]): void {
    if (typeof window === 'undefined') return;
    const all = this.read();
    if (columns.length === this.defaults.get(tableKey)?.length) delete all[tableKey];
    else all[tableKey] = columns;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}

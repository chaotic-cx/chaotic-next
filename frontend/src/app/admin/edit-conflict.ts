import { computed, signal } from '@angular/core';

/**
 * Picks the fields of a record that an edit dialog shows. Only these fields count for a conflict.
 */
export type ConflictFields<T> = (record: T) => Record<string, unknown>;

/**
 * True when one of the compared fields differs between the two versions of a record.
 */
export function recordChanged<T>(opened: T, latest: T, fields: ConflictFields<T>): boolean {
  const openedFields = fields(opened);
  const latestFields = fields(latest);

  for (const key of Object.keys(openedFields)) {
    if (openedFields[key] !== latestFields[key]) {
      return true;
    }
  }

  return false;
}

/**
 * Finds edits that would overwrite a change somebody else saved while the dialog was open.
 * Call `begin` when the dialog opens and `confirmUnchanged` before each save.
 */
export class EditConflictGuard<T> {
  private readonly opened = signal<T | null>(null);
  private readonly latest = signal<T | null>(null);
  private saveAnywayOnce = false;

  readonly changed = computed(() => this.latest() !== null);

  constructor(private readonly fields: ConflictFields<T>) {}

  begin(record: T): void {
    this.opened.set(record);
    this.latest.set(null);
    this.saveAnywayOnce = false;
  }

  /**
   * Loads the current record and compares it with the opened one.
   * Resolves to true when the save can go on. A failed or empty lookup does not block the save.
   */
  async confirmUnchanged(loadLatest: () => Promise<T | undefined>): Promise<boolean> {
    if (this.saveAnywayOnce) {
      this.saveAnywayOnce = false;
      return true;
    }

    const opened = this.opened();
    if (opened === null) {
      return true;
    }

    const latest = await this.loadOrUndefined(loadLatest);
    if (latest === undefined || !recordChanged(opened, latest, this.fields)) {
      return true;
    }

    this.latest.set(latest);
    return false;
  }

  /**
   * Accepts the changed record as the new starting point and returns it, so the form can show it.
   */
  review(): T | null {
    const latest = this.latest();
    if (latest !== null) {
      this.begin(latest);
    }

    return latest;
  }

  /**
   * Lets the next save overwrite the changed record.
   */
  overwrite(): void {
    this.latest.set(null);
    this.saveAnywayOnce = true;
  }

  private async loadOrUndefined(loadLatest: () => Promise<T | undefined>): Promise<T | undefined> {
    try {
      return await loadLatest();
    } catch {
      return undefined;
    }
  }
}

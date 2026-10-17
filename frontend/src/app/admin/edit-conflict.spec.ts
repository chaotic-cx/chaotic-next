import { describe, expect, it } from 'vitest';
import { EditConflictGuard, recordChanged } from './edit-conflict';

interface Builder {
  id: number;
  name: string;
  isActive: boolean;
  lastActive: string;
}

function builderFields(builder: Builder): Record<string, unknown> {
  return { name: builder.name, isActive: builder.isActive };
}

const OPENED: Builder = { id: 1, name: 'builder-1', isActive: true, lastActive: '2026-10-01' };

describe('recordChanged', () => {
  it('ignores fields that the dialog does not show', () => {
    expect(recordChanged(OPENED, { ...OPENED, lastActive: '2026-10-03' }, builderFields)).toBe(false);
  });

  it('detects a changed dialog field', () => {
    expect(recordChanged(OPENED, { ...OPENED, isActive: false }, builderFields)).toBe(true);
  });
});

describe('EditConflictGuard', () => {
  it('lets the save go on when the record is unchanged', async () => {
    const guard = new EditConflictGuard<Builder>(builderFields);
    guard.begin(OPENED);

    await expect(guard.confirmUnchanged(async () => ({ ...OPENED }))).resolves.toBe(true);
    expect(guard.changed()).toBe(false);
  });

  it('blocks the save and reports the conflict when the record changed', async () => {
    const guard = new EditConflictGuard<Builder>(builderFields);
    guard.begin(OPENED);

    await expect(guard.confirmUnchanged(async () => ({ ...OPENED, name: 'renamed' }))).resolves.toBe(false);
    expect(guard.changed()).toBe(true);
  });

  it('returns the changed record on review and accepts it as the new starting point', async () => {
    const guard = new EditConflictGuard<Builder>(builderFields);
    const latest = { ...OPENED, name: 'renamed' };
    guard.begin(OPENED);
    await guard.confirmUnchanged(async () => latest);

    expect(guard.review()).toEqual(latest);
    expect(guard.changed()).toBe(false);
    await expect(guard.confirmUnchanged(async () => latest)).resolves.toBe(true);
  });

  it('lets exactly one save overwrite the changed record', async () => {
    const guard = new EditConflictGuard<Builder>(builderFields);
    const latest = { ...OPENED, name: 'renamed' };
    guard.begin(OPENED);
    await guard.confirmUnchanged(async () => latest);

    guard.overwrite();

    expect(guard.changed()).toBe(false);
    await expect(guard.confirmUnchanged(async () => latest)).resolves.toBe(true);
    await expect(guard.confirmUnchanged(async () => latest)).resolves.toBe(false);
  });

  it('does not block the save when the lookup fails or finds nothing', async () => {
    const guard = new EditConflictGuard<Builder>(builderFields);
    guard.begin(OPENED);

    await expect(guard.confirmUnchanged(async () => undefined)).resolves.toBe(true);
    await expect(
      guard.confirmUnchanged(async () => {
        throw new Error('offline');
      }),
    ).resolves.toBe(true);
  });
});

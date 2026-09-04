import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { BuildStatus } from '../types/types';
import { NewPackageSubscriber, SuccessfulBuildSubscriber } from './issue-closure.subscriber';

function makeDataSource(): DataSource {
  return { subscribers: [] } as unknown as DataSource;
}

describe('NewPackageSubscriber', () => {
  it('does not close on stub package without version (failed build)', async () => {
    const tracker = { closeFulfilledNewRequest: vi.fn().mockResolvedValue(undefined) };
    const sub = new NewPackageSubscriber(makeDataSource(), tracker as never);
    await sub.afterInsert({
      entity: { pkgname: 'proton-pass', pkgbaseName: 'proton-pass', isActive: true, version: null },
    } as never);
    expect(tracker.closeFulfilledNewRequest).not.toHaveBeenCalled();
  });

  it('does not close on inactive package', async () => {
    const tracker = { closeFulfilledNewRequest: vi.fn().mockResolvedValue(undefined) };
    const sub = new NewPackageSubscriber(makeDataSource(), tracker as never);
    await sub.afterInsert({ entity: { pkgname: 'foo', isActive: false, version: '1.0-1' } } as never);
    expect(tracker.closeFulfilledNewRequest).not.toHaveBeenCalled();
  });

  it('closes on active package with version via afterInsert', async () => {
    const tracker = { closeFulfilledNewRequest: vi.fn().mockResolvedValue(undefined) };
    const sub = new NewPackageSubscriber(makeDataSource(), tracker as never);
    await sub.afterInsert({
      entity: { pkgname: 'foo', pkgbaseName: 'foo', isActive: true, version: '1.0-1' },
    } as never);
    expect(tracker.closeFulfilledNewRequest).toHaveBeenCalledWith('foo');
  });

  it('closes on afterUpdate when version becomes available', async () => {
    const tracker = { closeFulfilledNewRequest: vi.fn().mockResolvedValue(undefined) };
    const sub = new NewPackageSubscriber(makeDataSource(), tracker as never);
    await sub.afterUpdate({
      entity: { pkgname: 'foo', version: '1.0-1', isActive: true } as never,
      databaseEntity: { pkgname: 'foo', version: null, isActive: true } as never,
    } as never);
    expect(tracker.closeFulfilledNewRequest).toHaveBeenCalledWith('foo');
  });

  it('does not close on afterUpdate without version', async () => {
    const tracker = { closeFulfilledNewRequest: vi.fn().mockResolvedValue(undefined) };
    const sub = new NewPackageSubscriber(makeDataSource(), tracker as never);
    await sub.afterUpdate({
      entity: { pkgname: 'foo', isActive: true } as never,
      databaseEntity: { pkgname: 'foo', version: null, isActive: true } as never,
    } as never);
    expect(tracker.closeFulfilledNewRequest).not.toHaveBeenCalled();
  });
});

describe('SuccessfulBuildSubscriber', () => {
  it('does not close on failed build', async () => {
    const tracker = { closeFulfilledRebuild: vi.fn().mockResolvedValue(undefined) };
    const sub = new SuccessfulBuildSubscriber(makeDataSource(), tracker as never);
    await sub.afterInsert({ entity: { status: BuildStatus.FAILED, pkgbase: { pkgname: 'foo' } } } as never);
    expect(tracker.closeFulfilledRebuild).not.toHaveBeenCalled();
  });

  it('closes on success build', async () => {
    const tracker = { closeFulfilledRebuild: vi.fn().mockResolvedValue(undefined) };
    const sub = new SuccessfulBuildSubscriber(makeDataSource(), tracker as never);
    await sub.afterInsert({
      entity: { status: BuildStatus.SUCCESS, pkgbase: { pkgname: 'foo', pkgbaseName: 'foo' } },
    } as never);
    expect(tracker.closeFulfilledRebuild).toHaveBeenCalledWith('foo');
  });
});

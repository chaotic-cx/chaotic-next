import { describe, expect, it, vi } from 'vitest';
import { type Package } from '../builder/builder.entity';
import { AdminService } from './admin.service';

interface RescanJob {
  rescanned: number;
  total: number;
  failed: string[];
}

function adminService(failedReason: string | null): AdminService {
  const pkg = {
    id: 3,
    pkgname: '2bwm-git',
    version: '0.4.r1.g2608ac6-1',
    skipSignalScan: false,
    metadata: { filename: '2bwm-git-0.4.r1.g2608ac6-1-x86_64.pkg.tar.zst' },
    repo: { name: 'chaotic-aur' },
  } as unknown as Package;
  const signalScanService = {
    scanPackages: vi.fn(async ([job]: { file: string }[]) => ({
      scanned: failedReason ? 0 : 1,
      failed: failedReason ? [{ job, reason: failedReason }] : [],
    })),
    recomputeBroken: vi.fn(async () => undefined),
  };
  const service = new AdminService(
    { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    { findOne: vi.fn(async () => pkg) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    signalScanService as never,
    {} as never,
    {} as never,
  );
  vi.spyOn(service as unknown as { downloadPackage: () => Promise<void> }, 'downloadPackage').mockResolvedValue();
  return service;
}

async function rescan(service: AdminService): Promise<RescanJob> {
  const job: RescanJob = { rescanned: 0, total: 1, failed: [] };
  await (
    service as unknown as { runRescan(job: RescanJob, packages: unknown[], url: string): Promise<void> }
  ).runRescan(job, [{ pkgname: '2bwm-git', pkgType: 'chaotic' }], 'https://mirror.example');
  return job;
}

describe('AdminService rescan', () => {
  it('records a failed scan on the job instead of counting it as rescanned', async () => {
    const job = await rescan(adminService('spawn bsdtar ENOENT'));

    expect(job.rescanned).toBe(0);
    expect(job.failed).toEqual(['2bwm-git: scan failed: spawn bsdtar ENOENT']);
  });

  it('counts a successful scan as rescanned', async () => {
    const job = await rescan(adminService(null));

    expect(job).toMatchObject({ rescanned: 1, failed: [] });
  });
});

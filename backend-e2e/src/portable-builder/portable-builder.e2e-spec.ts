import { GithubIssuesService } from '@chaotic-next/backend/issue-tracker/github-issues.service';
import { PortableBuild } from '@chaotic-next/backend/portable-builder/portable-build.entity';
import { PortableBuilderService } from '@chaotic-next/backend/portable-builder/portable-builder.service';
import { VirustotalService } from '@chaotic-next/backend/diff-scan/virustotal.service';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

process.env.GITHUB_TOKEN ??= 'e2e-github-stub-token';
process.env.CAUR_BUILDER_WORKDIR = path.join(os.tmpdir(), `pb-e2e-${process.pid}`);
// The tiny test package finishes in seconds; sample fast enough to catch it.
process.env.CAUR_BUILDER_POLL_INTERVAL = '2000';
const workDir = process.env.CAUR_BUILDER_WORKDIR;

interface RecordedComment {
  issueNumber: number;
  body: string;
}

describe('Portable builder (e2e)', () => {
  let e2e: E2eApp;
  let comments: RecordedComment[];
  let removedLabels: { issueNumber: number; label: string }[];

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  // mockReset wipes mock implementations before each test, so spies live here.
  beforeEach(() => {
    comments = [];
    removedLabels = [];
    const github = e2e.app.get(GithubIssuesService);
    vi.spyOn(github, 'createComment').mockImplementation(async (issueNumber: number, body: string) => {
      comments.push({ issueNumber, body });
    });
    vi.spyOn(github, 'removeLabel').mockImplementation(async (issueNumber: number, label: string) => {
      removedLabels.push({ issueNumber, label });
    });
    const virustotal = e2e.app.get(VirustotalService);
    vi.spyOn(virustotal, 'reportOn').mockResolvedValue([]);
    Object.defineProperty(virustotal, 'enabled', { value: false, configurable: true });
  });

  afterAll(async () => {
    await e2e?.close();
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it(
    'builds chaotic-mirrorlist from the AUR, stores the outcome, and reports to the issue',
    { timeout: 900_000 },
    async () => {
      const builder = e2e.app.get(PortableBuilderService);
      const queued = await builder.enqueue('chaotic-mirrorlist', 777);
      await builder.drain();
      await vi.waitFor(() => expect(comments).toHaveLength(1));

      const repo = e2e.dataSource.getRepository(PortableBuild);
      const row = await repo.findOneBy({ id: queued.id });
      if (row?.status !== 'success') {
        console.log('unexpected build outcome:', row?.status, row?.error, row?.log?.slice(-2000));
      }
      expect(row?.status).toBe('success');
      expect(row?.error).toBeNull();
      expect(row?.issueNumber).toBe(777);
      expect(row?.startedAt).not.toBeNull();
      expect(row?.finishedAt).not.toBeNull();

      const artifacts = row?.artifacts ?? [];
      expect(artifacts.length).toBeGreaterThan(0);
      expect(artifacts[0]).toContain('chaotic-mirrorlist');

      const stats = row?.resourceStats;
      expect(stats).not.toBeNull();
      expect(Number(stats?.cpu_time_ns)).toBeGreaterThanOrEqual(0);
      expect(Number(stats?.peak_memory_bytes)).toBeGreaterThan(0);
      expect(Number(stats?.duration_ms)).toBeGreaterThan(0);
      expect(stats?.sample_count).toBeGreaterThanOrEqual(1);

      const scan = row?.scan;
      expect(scan).not.toBeNull();
      expect(['clean', 'findings']).toContain(scan?.status);
      expect(scan?.scannedFiles).toBeGreaterThan(0);
      expect(Array.isArray(scan?.findings)).toBe(true);
      if (process.env.CAUR_BUILDER_CLAMAV_IMAGE) {
        expect(Array.isArray(scan?.clamavDetections)).toBe(true);
      }

      expect(row?.log).toContain('Compressing packages');

      const logPath = await builder.getLogPath(queued.id);
      expect(logPath).not.toBeNull();
      const fullLog = await fs.readFile(logPath as string, 'utf8');
      expect(fullLog).toContain('Finished making: chaotic-mirrorlist');
      expect(fullLog.length).toBeGreaterThanOrEqual(row?.log?.length ?? 0);

      const artifactPath = await builder.getArtifactPath(queued.id, artifacts[0] as string);
      expect(artifactPath).not.toBeNull();
      const artifactStat = await fs.stat(artifactPath as string);
      expect(artifactStat.isFile()).toBe(true);
      expect(artifactStat.mode & 0o004).toBe(0o004);

      const res = await e2e.inject<{ status: string; artifacts: string[]; resourceStats: unknown }>({
        method: 'GET',
        url: `/portable-builder/builds/${queued.id}`,
      });
      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('success');
      expect(body.artifacts).toEqual(artifacts);

      expect(comments).toHaveLength(1);
      const report = comments[0];
      expect(report?.issueNumber).toBe(777);
      expect(report?.body).toContain('Test build of `chaotic-mirrorlist` succeeded');
      expect(report?.body).toContain(`/portable-builder/builds/${queued.id}/log`);
      expect(report?.body).toContain(encodeURIComponent(artifacts[0] as string));
      expect(report?.body).toContain('Container usage:');
      expect(report?.body).toContain('Artifact scan');
      expect(removedLabels).toContainEqual({ issueNumber: 777, label: 'build:test' });
    },
  );

  it('records a failed outcome when the pkgbase does not exist on the AUR', async () => {
    const builder = e2e.app.get(PortableBuilderService);
    const queued = await builder.enqueue('this-pkgbase-does-not-exist', 888);
    await builder.drain();
    await vi.waitFor(() => expect(comments.some((comment) => comment.issueNumber === 888)).toBe(true));

    const repo = e2e.dataSource.getRepository(PortableBuild);
    const row = await repo.findOneBy({ id: queued.id });
    expect(row?.status).toBe('failed');
    expect(row?.error).toContain('does not exist on the AUR');
    expect(row?.artifacts).toBeNull();
    expect(row?.resourceStats).toBeNull();

    const logPath = await builder.getLogPath(queued.id);
    expect(logPath).not.toBeNull();
    const fullLog = await fs.readFile(logPath as string, 'utf8');
    expect(fullLog).toContain('Cloning into');

    const res = await e2e.inject<{ status: string; error: string | null }>({
      method: 'GET',
      url: `/portable-builder/builds/${queued.id}`,
    });
    expect(res.statusCode).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('failed');
    expect(body.error).toContain('does not exist on the AUR');

    const report = comments.find((comment) => comment.issueNumber === 888);
    expect(report).toBeDefined();
    expect(report?.body).toContain('Test build of `this-pkgbase-does-not-exist` failed');
    expect(report?.body).toContain('Full log:');
    expect(removedLabels).toContainEqual({ issueNumber: 888, label: 'build:test' });
  });
});

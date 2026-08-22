import type {
  AurMaintainerChange,
  AurMaintainerInfo,
  AurPackageMeta,
  AurPackageScan,
  AurScanStreamChunk,
} from '@chaotic-next/shared-lib';
import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { filter, Observable, Subject } from 'rxjs';
import { Repository } from 'typeorm';
import { errorMessage, mapWithConcurrency } from '../utils/functions';
import { withSseKeepalive, type SseMessage } from '../utils/sse';
import { AurMaintainerSnapshot } from './aur-maintainer-snapshot.entity';
import { DiffScanService } from './diff-scan.service';
import type { ScanIndicator } from './indicators';
import { extractIndicators } from './indicators';
import { hostOf, parsePkgbuild, substituteVars } from './pkgbuild';
import { VirustotalService } from './virustotal.service';

const AUR_INFO_URL = 'https://aur.archlinux.org/rpc/v5/info';
const AUR_SEARCH_URL = 'https://aur.archlinux.org/rpc/v5/search';
const AUR_FILE_URL = 'https://aur.archlinux.org/cgit/aur.git/plain';
const AUR_FETCH_TIMEOUT_MS = 15_000;
const MAX_SCANNED_FILES = 10;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAINTAINER_NOVICE_TENURE_MS = 180 * 24 * 60 * 60 * 1000;
const INFO_BATCH_WINDOW_MS = 50;
const INFO_BATCH_SIZE = 50;
const MAINTAINER_PROFILE_TTL_MS = 60 * 60 * 1000;
const MAINTAINER_LOOKUP_CONCURRENCY = 3;
const SCANNABLE_EXTENSIONS = new Set([
  'sh',
  'install',
  'hook',
  'patch',
  'diff',
  'py',
  'pl',
  'rb',
  'conf',
  'service',
  'timer',
  'desktop',
]);
const MAX_RECENT_SCANS = 10;
const SECONDS_TO_MS = 1000;

interface AurPackageInfo {
  Name?: string;
  PackageBase?: string;
  Maintainer?: string | null;
  CoMaintainers?: string[] | null;
  NumVotes?: number;
  Popularity?: number;
  OutOfDate?: number | null;
  FirstSubmitted?: number;
}

interface AurInfoResponse {
  results?: AurPackageInfo[];
}

interface AurSearchResponse {
  results?: AurPackageInfo[];
}

@Injectable()
export class AurScanService {
  private readonly logger = new Logger(AurScanService.name);
  private readonly scans = new Map<string, AurPackageScan>();
  private readonly scanUpdates = new Subject<AurPackageScan>();
  private readonly maintainerProfiles = new Map<string, { profile: AurMaintainerInfo; fetchedAt: number }>();
  private infoBatch: { name: string; resolve: (info: AurPackageInfo | undefined) => void }[] = [];
  private infoBatchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly diffScanService: DiffScanService,
    private readonly virustotalService: VirustotalService,
    @Optional()
    @InjectRepository(AurMaintainerSnapshot)
    private readonly snapshotRepository?: Repository<AurMaintainerSnapshot>,
  ) {}

  getScan(packageName: string): AurPackageScan | null {
    return this.scans.get(packageName.toLowerCase()) ?? null;
  }

  streamScan(packageName: string): Observable<SseMessage<AurScanStreamChunk>> {
    const current = this.getScan(packageName);
    if (!current) throw new NotFoundException(`No scan recorded for "${packageName}"`);

    // Scans can stay quiet for a long time (e.g. VirusTotal lookups), so the
    // stream needs keepalives to survive proxy idle timeouts.
    return withSseKeepalive(
      new Observable<SseMessage<AurScanStreamChunk>>((subscriber) => {
        const emit = (scan: AurPackageScan): void => {
          const settled = scan.status === 'done' || scan.status === 'failed';
          subscriber.next({ data: { scan: { ...scan }, complete: settled } });
          if (settled) subscriber.complete();
        };

        emit(current);
        const updates = this.scanUpdates
          .pipe(filter((scan) => scan.packageName === current.packageName))
          .subscribe(emit);
        return () => updates.unsubscribe();
      }),
    );
  }

  async startScan(packageName: string): Promise<AurPackageScan> {
    const scan: AurPackageScan = {
      packageName,
      packageBase: '',
      status: 'scanning',
      sources: [],
      scannedFiles: [],
      findings: [],
      vtReports: [],
      vtPending: 0,
      maintainers: [],
      packageMeta: {
        votes: 0,
        popularity: 0,
        firstSubmitted: '',
        outOfDate: false,
        orphaned: false,
      },
      startedAt: new Date().toISOString(),
    };
    this.rememberScan(scan);
    this.logger.log(`AUR scan of ${packageName} started`);

    try {
      const pkgbuildText = await this.fetchPkgbuild(packageName);
      scan.packageBase = pkgbuildText.packageBase;
      const status = await this.maintainerStatus(pkgbuildText.info);
      scan.packageMeta = status.meta;
      scan.maintainers = status.maintainers;
      scan.maintainerChange = status.change ?? undefined;

      const changes = [fullFileDiff('PKGBUILD', pkgbuildText.text)];
      const parsed = parsePkgbuild(changes[0]);
      scan.sources = parsed?.entries.map((entry) => entry.raw) ?? [];

      const sourceFiles = await this.fetchScannableSources(parsed, pkgbuildText.packageBase);
      scan.sourceFiles = sourceFiles;

      for (const file of sourceFiles) {
        changes.push(fullFileDiff(file.name, file.content));
      }
      scan.scannedFiles = changes.map((change) => change.new_path);
      scan.findings = await this.diffScanService.scanDiffs(changes);

      const indicators = extractIndicators(changes);
      scan.vtPending = indicators.length;
      if (this.virustotalService.enabled && indicators.length > 0) {
        scan.status = 'awaiting-vt';
        void this.enrichVirusTotal(scan, indicators);
      } else {
        scan.vtPending = 0;
        scan.status = 'done';
      }
    } catch (err) {
      scan.status = 'failed';
      scan.error = errorMessage(err);
      this.logger.warn(`AUR scan of ${packageName} failed: ${scan.error}`);
    }
    this.logger.log(
      `AUR scan of ${packageName} finished after ${Date.now() - Date.parse(scan.startedAt)}ms with ` +
        `${scan.findings.length} finding(s)`,
    );
    this.scanUpdates.next({ ...scan });
    return { ...scan };
  }

  private async enrichVirusTotal(scan: AurPackageScan, indicators: ScanIndicator[]): Promise<void> {
    try {
      scan.vtReports = await this.virustotalService.reportOn(indicators);
    } catch (err) {
      this.logger.warn(`VirusTotal enrichment for ${scan.packageName} failed: ${errorMessage(err)}`);
    } finally {
      scan.vtPending = 0;
      scan.status = 'done';
      this.scanUpdates.next({ ...scan });
    }
  }

  async maintainerStatusOf(
    packageName: string,
  ): Promise<{ maintainers: AurMaintainerInfo[]; meta: AurPackageMeta; change: AurMaintainerChange | null } | null> {
    const info = await this.fetchInfo(packageName);
    if (!info?.PackageBase) return null;
    return await this.maintainerStatus(info);
  }

  /** Packages missing from the AUR response are absent so callers retry them. */
  async maintainerStatusFor(
    packageNames: string[],
  ): Promise<
    Map<string, { maintainers: AurMaintainerInfo[]; meta: AurPackageMeta; change: AurMaintainerChange | null }>
  > {
    const infos = await this.fetchInfos(packageNames);
    const validInfos = infos.filter((info) => info.Name !== undefined && info.PackageBase !== undefined);
    const entries = await mapWithConcurrency(
      validInfos,
      async (info) => [info.Name as string, await this.maintainerStatus(info)] as const,
      MAINTAINER_LOOKUP_CONCURRENCY,
    );
    return new Map(entries);
  }

  private async fetchInfos(packageNames: string[]): Promise<AurPackageInfo[]> {
    if (packageNames.length === 0) return [];
    try {
      const query = packageNames.map((name) => `arg[]=${encodeURIComponent(name)}`).join('&');
      const response = await this.fetchAur(`${AUR_INFO_URL}?${query}`);
      if (!response.ok) {
        this.logger.warn(`AUR multiinfo request for ${packageNames.length} package(s) returned ${response.status}`);
        return [];
      }
      return ((await response.json()) as AurInfoResponse).results ?? [];
    } catch (err) {
      this.logger.warn(`AUR multiinfo request for ${packageNames.length} package(s) failed: ${errorMessage(err)}`);
      return [];
    }
  }

  private async maintainerStatus(info: AurPackageInfo): Promise<{
    maintainers: AurMaintainerInfo[];
    meta: AurPackageMeta;
    change: AurMaintainerChange | null;
  }> {
    const maintainers = await this.collectMaintainers(info);
    const usernames = maintainers.map((maintainer) => maintainer.username);
    const change = await this.diffAgainstSnapshot(info.Name ?? '', usernames);
    return { maintainers, meta: packageMetaOf(info), change };
  }

  private async diffAgainstSnapshot(packageName: string, usernames: string[]): Promise<AurMaintainerChange | null> {
    if (!this.snapshotRepository || packageName === '') return null;

    try {
      const snapshot = await this.snapshotRepository.findOne({ where: { packageName } });
      const previous = snapshot?.maintainers;
      await this.snapshotRepository.upsert({ packageName, maintainers: usernames }, ['packageName']);
      if (previous === undefined) return null;

      const added = usernames.filter((username) => !previous.includes(username));
      const removed = previous.filter((username) => !usernames.includes(username));
      if (added.length === 0 && removed.length === 0) return null;
      return { previous, added, removed, detectedAt: new Date().toISOString() };
    } catch (err) {
      this.logger.warn(`Maintainer snapshot for ${packageName} failed: ${errorMessage(err)}`);
      return null;
    }
  }

  private fetchInfo(packageName: string): Promise<AurPackageInfo | undefined> {
    return new Promise((resolve) => {
      this.infoBatch.push({ name: packageName, resolve });
      if (this.infoBatch.length >= INFO_BATCH_SIZE) {
        void this.flushInfoBatch();
      } else if (this.infoBatchTimer === null) {
        this.infoBatchTimer = setTimeout(() => void this.flushInfoBatch(), INFO_BATCH_WINDOW_MS);
      }
    });
  }

  private async flushInfoBatch(): Promise<void> {
    const batch = this.infoBatch;
    this.infoBatch = [];
    if (this.infoBatchTimer !== null) {
      clearTimeout(this.infoBatchTimer);
      this.infoBatchTimer = null;
    }
    if (batch.length === 0) return;

    try {
      const query = batch.map((entry) => `arg[]=${encodeURIComponent(entry.name)}`).join('&');
      const response = await this.fetchAur(`${AUR_INFO_URL}?${query}`);
      const results = response.ok ? (((await response.json()) as AurInfoResponse).results ?? []) : [];
      const byName = new Map(results.map((info) => [info.Name, info]));
      for (const entry of batch) entry.resolve(byName.get(entry.name));
    } catch (err) {
      this.logger.warn(`AUR multiinfo request for ${batch.length} package(s) failed: ${errorMessage(err)}`);
      for (const entry of batch) entry.resolve(undefined);
    }
  }

  private async fetchPkgbuild(
    packageName: string,
  ): Promise<{ info: AurPackageInfo; packageBase: string; text: string }> {
    const info = await this.fetchInfo(packageName);
    if (!info?.PackageBase) throw new NotFoundException(`No AUR package named "${packageName}"`);

    const pkgbuild = await this.fetchAur(`${AUR_FILE_URL}/PKGBUILD?h=${encodeURIComponent(info.PackageBase)}`);
    if (!pkgbuild.ok) throw new NotFoundException(`No PKGBUILD found for ${packageName}`);
    return { info, packageBase: info.PackageBase, text: await pkgbuild.text() };
  }

  private async collectMaintainers(info: AurPackageInfo): Promise<AurMaintainerInfo[]> {
    const usernames = [...new Set([info.Maintainer ?? '', ...(info.CoMaintainers ?? [])])].filter(
      (username) => username !== '',
    );
    const fallbackOldestMs = unixSecondsToMs(info.FirstSubmitted ?? 0);
    return await Promise.all(usernames.map((username) => this.maintainerProfile(username, fallbackOldestMs)));
  }

  private async maintainerProfile(username: string, fallbackOldestMs: number): Promise<AurMaintainerInfo> {
    const cached = this.maintainerProfiles.get(username);
    if (cached && Date.now() - cached.fetchedAt < MAINTAINER_PROFILE_TTL_MS) return cached.profile;

    const profile = await this.fetchMaintainerProfile(username, fallbackOldestMs);
    this.maintainerProfiles.set(username, { profile, fetchedAt: Date.now() });
    return profile;
  }

  private async fetchMaintainerProfile(username: string, fallbackOldestMs: number): Promise<AurMaintainerInfo> {
    try {
      const response = await this.fetchAur(`${AUR_SEARCH_URL}?by=maintainer&arg=${encodeURIComponent(username)}`);
      const results = response.ok ? (((await response.json()) as AurSearchResponse).results ?? []) : [];
      const oldestFirstSubmittedMs = results.reduce(
        (oldest, pkg) => Math.min(oldest, unixSecondsToMs(pkg.FirstSubmitted ?? 0)),
        fallbackOldestMs,
      );
      return {
        username,
        packagesMaintained: results.length,
        totalVotes: results.reduce((sum, pkg) => sum + (pkg.NumVotes ?? 0), 0),
        oldestFirstSubmitted: new Date(oldestFirstSubmittedMs).toISOString(),
        novice: Date.now() - oldestFirstSubmittedMs < MAINTAINER_NOVICE_TENURE_MS,
      };
    } catch (err) {
      this.logger.debug(`Maintainer profile for ${username} unavailable: ${errorMessage(err)}`);
      return {
        username,
        packagesMaintained: 0,
        totalVotes: 0,
        oldestFirstSubmitted: new Date(fallbackOldestMs).toISOString(),
        novice: Date.now() - fallbackOldestMs < MAINTAINER_NOVICE_TENURE_MS,
      };
    }
  }

  private async fetchScannableSources(
    parsed: ReturnType<typeof parsePkgbuild>,
    packageBase: string,
  ): Promise<{ name: string; content: string }[]> {
    if (!parsed) return [];
    const files: { name: string; content: string }[] = [];

    for (const entry of parsed.entries) {
      if (files.length >= MAX_SCANNED_FILES) break;
      if (entry.isVcs) continue;

      const raw = substituteVars(entry.raw, parsed.vars);
      if (raw === null) continue;

      const remote = hostOf(raw) !== null;
      if (remote && !isScannableName(raw)) continue;

      const url = remote ? raw : `${AUR_FILE_URL}/${encodeURIComponent(raw)}?h=${encodeURIComponent(packageBase)}`;
      const name = raw.slice(raw.lastIndexOf('/') + 1).replace(/[?#].*$/, '');
      try {
        const response = await this.fetchAur(url);
        if (!response.ok) continue;
        const content = await response.text();
        if (content.length > MAX_FILE_BYTES) continue;
        files.push({ name, content });
        this.logger.debug(`Fetched ${url} for scanning (${content.length} bytes)`);
      } catch (err) {
        this.logger.debug(`Skipping source ${raw}: ${errorMessage(err)}`);
      }
    }
    return files;
  }

  private async fetchAur(url: string): Promise<Response> {
    return await fetch(url, {
      headers: { 'user-agent': 'chaotic-next/aur-scan' },
      signal: AbortSignal.timeout(AUR_FETCH_TIMEOUT_MS),
    });
  }

  private rememberScan(scan: AurPackageScan): void {
    this.scans.set(scan.packageName.toLowerCase(), scan);
    const recent = [...this.scans.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    while (recent.length > MAX_RECENT_SCANS) {
      const evicted = recent.shift();
      if (evicted) this.scans.delete(evicted.packageName.toLowerCase());
    }
  }
}

function isScannableName(name: string): boolean {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return SCANNABLE_EXTENSIONS.has(extension);
}

function unixSecondsToMs(seconds: number): number {
  return seconds * SECONDS_TO_MS;
}

function packageMetaOf(info: AurPackageInfo): AurPackageMeta {
  return {
    votes: info.NumVotes ?? 0,
    popularity: info.Popularity ?? 0,
    firstSubmitted: new Date(unixSecondsToMs(info.FirstSubmitted ?? 0)).toISOString(),
    outOfDate: info.OutOfDate !== null && info.OutOfDate !== undefined,
    orphaned: info.Maintainer === null || info.Maintainer === undefined || info.Maintainer === '',
  };
}

/** The whole file framed as an all-added diff so the rule catalog can scan it. */
function fullFileDiff(path: string, content: string): MergeRequestDiffSchema {
  const lines = content.split('\n');
  return {
    diff: [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)].join('\n'),
    new_path: path,
    old_path: path,
  } as MergeRequestDiffSchema;
}

import {
  type AurMaintainerChange,
  type AurMaintainerInfo,
  type AurPackageMeta,
  type AurPackageScan,
  type AurRpcInfoResponse,
  type AurRpcPackage,
  type AurRpcSearchResponse,
  type AurScanStreamChunk,
} from '@chaotic-next/shared-lib';
import { type MergeRequestDiffSchema } from '@gitbeaker/core';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { filter, Observable, Subject } from 'rxjs';
import { Repository } from 'typeorm';
import { mapWithConcurrency } from '../utils/functions';
import { type SseMessage, withSseKeepalive } from '../utils/sse';
import { AurAuthService } from './aur-auth.service';
import { commentThreatFinding, evaluateCommentThreats, parseAurComments } from './aur-comments';
import { AurMaintainerSnapshot } from './aur-maintainer-snapshot.entity';
import { AurResponseCache } from './aur-response-cache';
import { DiffScanService } from './diff-scan.service';
import { extractIndicators, type ScanIndicator } from './indicators';
import { parsePkgbuild } from './pkgbuild';
import { VirustotalService } from './virustotal.service';

const AUR_INFO_URL = 'https://aur.archlinux.org/rpc/v5/info';
const AUR_SEARCH_URL = 'https://aur.archlinux.org/rpc/v5/search';
const AUR_PACKAGE_URL = 'https://aur.archlinux.org/packages';
const AUR_FILE_URL = 'https://aur.archlinux.org/cgit/aur.git/plain';
const AUR_CGIT_TREE_URL = 'https://aur.archlinux.org/cgit/aur.git/tree';
const REPO_TREE_MAX_DEPTH = 3;
const AUR_FETCH_TIMEOUT_MS = 15_000;
const MAX_SCANNED_FILES = 10;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAINTAINER_NOVICE_TENURE_MS = 180 * 24 * 60 * 60 * 1000;
const INFO_BATCH_WINDOW_MS = 50;
const INFO_BATCH_SIZE = 50;
const MAINTAINER_PROFILE_TTL_MS = 60 * 60 * 1000;
const MAINTAINER_LOOKUP_CONCURRENCY = 3;
const MAX_RECENT_SCANS = 10;
const SECONDS_TO_MS = 1000;
const HTTP_SERVER_ERROR_MIN = 500;

export interface AurScanOptions {
  /**
   * VirusTotal enrichment runs by default (internal/MR scans). The controller
   * derives this server-side from the request's auth session — anonymous
   * frontend scans get no VirusTotal lookups.
   */
  withVirusTotal?: boolean;
}

@Injectable()
export class AurScanService {
  private readonly scans = new Map<string, AurPackageScan>();
  private readonly scanUpdates = new Subject<AurPackageScan>();
  private readonly maintainerProfiles = new Map<string, { profile: AurMaintainerInfo; fetchedAt: number }>();
  private readonly aurResponses = new AurResponseCache();
  private infoBatch: { name: string; resolve: (info: AurRpcPackage | undefined) => void }[] = [];
  private infoBatchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly diffScanService: DiffScanService,
    private readonly virustotalService: VirustotalService,
    private readonly aurAuthService: AurAuthService,
    @InjectPinoLogger(AurScanService.name) private readonly pino: PinoLogger,
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

  async startScan(packageName: string, options?: AurScanOptions): Promise<AurPackageScan> {
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
    this.pino.info({ packageName }, 'AUR scan started');

    try {
      const pkgbuildText = await this.fetchPkgbuild(packageName);
      scan.packageBase = pkgbuildText.packageBase;
      const status = await this.maintainerStatus(pkgbuildText.info);
      scan.packageMeta = status.meta;
      scan.maintainers = status.maintainers;
      scan.maintainerChange = status.change ?? undefined;

      const changes = [fullFileDiff('PKGBUILD', pkgbuildText.text)];
      const parsed = parsePkgbuild(changes[0]);

      // parsePkgbuild already resolves PKGBUILD variables, so sources are actual URLs.
      scan.sources = parsed?.entries.map((entry) => entry.raw) ?? [];

      const { files, skippedBinaryFiles } = await this.collectRepoFiles(pkgbuildText.packageBase);

      // The PKGBUILD is part of the tree; ship exactly one copy (first) and scan it exactly once.
      scan.sourceFiles = [
        { name: 'PKGBUILD', content: pkgbuildText.text },
        ...files.filter((file) => file.name !== 'PKGBUILD'),
      ];
      scan.skippedBinaryFiles = skippedBinaryFiles;

      for (const file of files) {
        if (file.name === 'PKGBUILD') continue;
        changes.push(fullFileDiff(file.name, file.content));
      }
      scan.scannedFiles = changes.map((change) => change.new_path);
      scan.findings = await this.diffScanService.scanDiffs(
        changes,
        undefined,
        'full-file',
        this.packageDependencies.bind(this),
      );
      await this.appendCommentThreat(scan);

      const indicators = extractIndicators(changes);
      scan.vtPending = indicators.length;
      const withVirusTotal = options?.withVirusTotal ?? true;
      if (withVirusTotal && this.virustotalService.enabled && indicators.length > 0) {
        scan.status = 'awaiting-vt';
        void this.enrichVirusTotal(scan, indicators);
      } else {
        scan.vtPending = 0;
        scan.status = 'done';
      }
    } catch (err) {
      scan.status = 'failed';
      scan.error = err instanceof Error ? err.message : String(err);
      this.pino.warn({ err, packageName }, 'AUR scan failed');
    }
    this.pino.info(
      {
        packageName,
        durationMs: Date.now() - Date.parse(scan.startedAt),
        findingCount: scan.findings.length,
      },
      'AUR scan finished',
    );
    this.scanUpdates.next({ ...scan });
    return { ...scan };
  }

  private async enrichVirusTotal(scan: AurPackageScan, indicators: ScanIndicator[]): Promise<void> {
    try {
      scan.vtReports = await this.virustotalService.reportOn(indicators);
    } catch (err) {
      this.pino.warn({ err, packageName: scan.packageName }, 'VirusTotal enrichment failed');
    } finally {
      scan.vtPending = 0;
      scan.status = 'done';
      this.scanUpdates.next({ ...scan });
    }
  }

  /** Best-effort community signal. An unavailable comment section never fails the scan. */
  private async appendCommentThreat(scan: AurPackageScan): Promise<void> {
    if (!scan.packageBase) return;
    try {
      const page = await this.fetchAur(`${AUR_PACKAGE_URL}/${encodeURIComponent(scan.packageBase)}`);
      if (!page.ok) {
        this.pino.warn({ packageBase: scan.packageBase, status: page.status }, 'Comment page request failed');
        return;
      }
      const verdict = evaluateCommentThreats(parseAurComments(await page.text()), scan.packageMeta);
      if (!verdict) return;
      scan.findings.push(commentThreatFinding(verdict, scan.packageBase));
    } catch (err) {
      this.pino.debug({ err, packageBase: scan.packageBase }, 'Comment check unavailable');
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

  async packageDependencies(packageName: string): Promise<string[] | null> {
    const info = await this.fetchInfo(packageName);
    if (!info?.PackageBase) return null;
    return info.Depends ?? [];
  }

  private async fetchInfos(packageNames: string[]): Promise<AurRpcPackage[]> {
    if (packageNames.length === 0) return [];
    try {
      const query = packageNames.map((name) => `arg[]=${encodeURIComponent(name)}`).join('&');
      const response = await this.fetchAur(`${AUR_INFO_URL}?${query}`);
      if (!response.ok) {
        this.pino.warn({ count: packageNames.length, status: response.status }, 'AUR multiinfo request failed');
        return [];
      }
      return ((await response.json()) as AurRpcInfoResponse).results ?? [];
    } catch (err) {
      this.pino.warn({ err, count: packageNames.length }, 'AUR multiinfo request failed');
      return [];
    }
  }

  private async maintainerStatus(info: AurRpcPackage): Promise<{
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
      this.pino.warn({ err, packageName }, 'Maintainer snapshot failed');
      return null;
    }
  }

  private fetchInfo(packageName: string): Promise<AurRpcPackage | undefined> {
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
      if (!response.ok) {
        // An AUR outage must not masquerade as "packages do not exist".
        this.pino.warn({ count: batch.length, status: response.status }, 'AUR multiinfo request failed');
      }

      const results = response.ok ? (((await response.json()) as AurRpcInfoResponse).results ?? []) : [];
      const byName = new Map(results.map((info) => [info.Name, info]));
      for (const entry of batch) entry.resolve(byName.get(entry.name));
    } catch (err) {
      this.pino.warn({ err, count: batch.length }, 'AUR multiinfo request failed');
      for (const entry of batch) entry.resolve(undefined);
    }
  }

  private async fetchPkgbuild(
    packageName: string,
  ): Promise<{ info: AurRpcPackage; packageBase: string; text: string }> {
    const info = await this.fetchInfo(packageName);
    if (!info?.PackageBase) throw new NotFoundException(`No AUR package named "${packageName}"`);

    const pkgbuild = await this.fetchAur(`${AUR_FILE_URL}/PKGBUILD?h=${encodeURIComponent(info.PackageBase)}`);
    if (pkgbuild.status >= HTTP_SERVER_ERROR_MIN) {
      throw new Error(`AUR web interface returned ${pkgbuild.status} for the PKGBUILD of ${packageName}`);
    }

    if (!pkgbuild.ok) throw new NotFoundException(`No PKGBUILD found for ${packageName}`);
    return { info, packageBase: info.PackageBase, text: await pkgbuild.text() };
  }

  private async collectMaintainers(info: AurRpcPackage): Promise<AurMaintainerInfo[]> {
    const usernames = [...new Set([info.Maintainer ?? '', ...(info.CoMaintainers ?? [])])].filter(
      (username) => username !== '',
    );
    const fallbackDate = new Date(unixSecondsToMs(info.FirstSubmitted ?? 0));
    return await Promise.all(usernames.map((username) => this.maintainerProfile(username, fallbackDate)));
  }

  private async maintainerProfile(username: string, fallbackDate: Date): Promise<AurMaintainerInfo> {
    const cached = this.maintainerProfiles.get(username);
    if (cached && Date.now() - cached.fetchedAt < MAINTAINER_PROFILE_TTL_MS) return cached.profile;

    const profile = await this.fetchMaintainerProfile(username, fallbackDate);
    this.maintainerProfiles.set(username, { profile, fetchedAt: Date.now() });
    return profile;
  }

  private async fetchMaintainerProfile(username: string, fallbackDate: Date): Promise<AurMaintainerInfo> {
    try {
      const response = await this.fetchAur(`${AUR_SEARCH_URL}?by=maintainer&arg=${encodeURIComponent(username)}`);
      if (!response.ok) {
        this.pino.warn({ username, status: response.status }, 'Maintainer search failed');
      }

      const results = response.ok ? (((await response.json()) as AurRpcSearchResponse).results ?? []) : [];

      // Real account age comes from the scraped AUR profile; until it is
      // available, the maintainer's oldest package submission approximates it.
      const registeredDate =
        (await this.aurAuthService.getMaintainerRegistrationDate(username)) ??
        new Date(
          results.reduce(
            (oldest, pkg) => Math.min(oldest, unixSecondsToMs(pkg.FirstSubmitted ?? 0)),
            fallbackDate.getTime(),
          ),
        );
      const novice = Date.now() - registeredDate.getTime() < MAINTAINER_NOVICE_TENURE_MS;

      return {
        username,
        packagesMaintained: results.length,
        totalVotes: results.reduce((sum, pkg) => sum + (pkg.NumVotes ?? 0), 0),
        registeredDate: registeredDate.toISOString(),
        novice,
      };
    } catch (err) {
      this.pino.debug({ err, username }, 'Maintainer profile unavailable');
      return {
        username,
        packagesMaintained: 0,
        totalVotes: 0,
        registeredDate: fallbackDate.toISOString(),
        novice: Date.now() - fallbackDate.getTime() < MAINTAINER_NOVICE_TENURE_MS,
      };
    }
  }

  /** Ships every textual file of the AUR repo; binary/oversized paths are reported instead. */
  private async collectRepoFiles(packageBase: string): Promise<{
    files: { name: string; content: string }[];
    skippedBinaryFiles: string[];
  }> {
    const paths = (await this.listRepoPaths(packageBase)).slice(0, MAX_SCANNED_FILES);
    const fetched = await Promise.all(paths.map((path) => this.fetchRepoFile(path, packageBase)));

    const files: { name: string; content: string }[] = [];
    const skippedBinaryFiles: string[] = [];
    for (const [index, file] of fetched.entries()) {
      const path = paths[index];
      if (file === undefined) continue;
      if ('binary' in file) {
        skippedBinaryFiles.push(path);
        continue;
      }
      files.push({ name: path, content: file.content });
    }
    return { files, skippedBinaryFiles };
  }

  private async fetchRepoFile(
    path: string,
    packageBase: string,
  ): Promise<{ content: string } | { binary: true } | undefined> {
    const url = `${AUR_FILE_URL}/${path.split('/').map(encodeURIComponent).join('/')}?h=${encodeURIComponent(packageBase)}`;
    try {
      const response = await this.fetchAur(url);
      if (!response.ok) return undefined;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!looksTextual(bytes) || bytes.length > MAX_FILE_BYTES) return { binary: true };
      const content = new TextDecoder().decode(bytes);
      this.pino.debug({ url, byteCount: bytes.length }, 'Fetched repo file for scanning');
      return { content };
    } catch (err) {
      this.pino.debug({ err, path }, 'Skipping repo file');
      return undefined;
    }
  }

  /** Walks the cgit tree listing, recursing into subdirectories up to a small depth. */
  private async listRepoPaths(packageBase: string, maxDepth = REPO_TREE_MAX_DEPTH): Promise<string[]> {
    const paths: string[] = [];
    const seen = new Set<string>();
    const queue: { depth: number; path: string }[] = [{ depth: 0, path: '' }];

    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      const { depth, path } = next;
      let response: Response;
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');

      try {
        response = await this.fetchAur(`${AUR_CGIT_TREE_URL}/${encodedPath}?h=${encodeURIComponent(packageBase)}`);
      } catch (err) {
        this.pino.debug({ err, path }, 'Repo tree listing unavailable');
        continue;
      }
      if (!response.ok) continue;

      const html = await response.text();
      for (const entry of extractTreeEntries(html)) {
        if (seen.has(entry.path)) continue;
        seen.add(entry.path);
        if (paths.length + queue.length >= MAX_SCANNED_FILES) return paths;
        if (entry.isDirectory && depth + 1 < maxDepth) {
          queue.push({ depth: depth + 1, path: `${entry.path}/` });
        } else if (!entry.isDirectory) {
          paths.push(entry.path);
        }
      }
    }
    return paths;
  }

  private async fetchAur(url: string): Promise<Response> {
    return await this.aurResponses.run(url, () =>
      fetch(url, {
        headers: { 'user-agent': 'chaotic-next/aur-scan' },
        signal: AbortSignal.timeout(AUR_FETCH_TIMEOUT_MS),
      }),
    );
  }

  clearAurCache(): void {
    this.aurResponses.clear();
  }

  async searchAur(query: string): Promise<string[]> {
    if (query.length < 3) return [];

    try {
      const response = await this.fetchAur(`${AUR_SEARCH_URL}?arg=${encodeURIComponent(query)}`);
      if (!response.ok) {
        this.pino.warn({ query, status: response.status }, 'AUR search failed');
        return [];
      }

      const data = (await response.json()) as AurRpcSearchResponse;
      return data.results?.map((pkg) => pkg.Name ?? '') ?? [];
    } catch (err) {
      this.pino.warn({ err, query }, 'AUR search failed');
      return [];
    }
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

function unixSecondsToMs(seconds: number): number {
  return seconds * SECONDS_TO_MS;
}

const TEXT_SNIFF_BYTES = 8192;
const CONTROL_BYTE_RATIO_LIMIT = 0.1;
/** cgit tree links look like href="/cgit/aur.git/tree/<path>?h=<base>" (directories end in "/"). */
const CGIT_TREE_HREF_PREFIX = '/cgit/aur.git/tree/';

interface TreeEntry {
  path: string;
  isDirectory: boolean;
}

function looksTextual(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, TEXT_SNIFF_BYTES);
  let controlBytes = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 7 || (byte > 13 && byte < 32)) controlBytes++;
  }
  return sample.length === 0 || controlBytes / sample.length < CONTROL_BYTE_RATIO_LIMIT;
}

function extractTreeEntries(html: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  const seen = new Set<string>();
  // cgit renders attributes in single quotes; directories end with a slash.
  const pattern = new RegExp(`${CGIT_TREE_HREF_PREFIX}([^'"?]*/?)\\?h=[^'"]*['"]`, 'g');
  for (const match of html.matchAll(pattern)) {
    const rawPath = decodeURIComponent(match[1] ?? '');
    if (rawPath === '' || rawPath === '/' || seen.has(rawPath)) continue;
    seen.add(rawPath);
    const isDirectory = rawPath.endsWith('/');
    entries.push({ path: isDirectory ? rawPath.slice(0, -1) : rawPath, isDirectory });
  }
  return entries;
}

function packageMetaOf(info: AurRpcPackage): AurPackageMeta {
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
    new_file: true,
  } as MergeRequestDiffSchema;
}

import { mapWithConcurrency } from '../utils/functions';
import { type ScanIndicator } from './indicators';
import { statsToColumns, VirusTotalVerdict } from './virus-total-verdict.entity';
import { type VtEngineStats, type VtIndicatorReport, type VtVerdict } from '@chaotic-next/shared-lib';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { LessThan, Repository } from 'typeorm';

const VT_API_BASE = 'https://www.virustotal.com/api/v3';
const VT_TIMEOUT_MS = 15_000;
const VT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const VT_LOOKUP_CONCURRENCY = 1;
const DEFAULT_REQUEST_SPACING_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 20_000;
const ANALYSIS_POLL_ATTEMPTS = 6;
const MALICIOUS_ENGINE_THRESHOLD = 3;
const SUSPICIOUS_ENGINE_THRESHOLD = 2;
const VERDICT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type EngineStatsOrUnknown = VtEngineStats | 'unknown';

interface VtSubmitResponse {
  data?: { id?: string };
}

interface VtAnalysisResponse {
  data?: { attributes?: { status?: string; stats?: Partial<VtEngineStats> } };
}

interface VtStatsResponse {
  data?: { attributes?: { last_analysis_stats?: Partial<VtEngineStats> } };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class VirustotalService {
  private lastRequestAt = 0;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
    @InjectPinoLogger(VirustotalService.name) private readonly pino: PinoLogger,
    @Optional() @InjectRepository(VirusTotalVerdict) private readonly verdictRepository?: Repository<VirusTotalVerdict>,
  ) {}

  get enabled(): boolean {
    return this.configService.get<string>('vt.apiKey') !== undefined;
  }

  async reportOn(indicators: ScanIndicator[]): Promise<VtIndicatorReport[]> {
    if (!this.enabled || indicators.length === 0) return [];
    this.pino.debug({ count: indicators.length }, 'Checking indicators against VirusTotal');
    const reports = await mapWithConcurrency(
      indicators,
      (indicator) => this.reportOnIndicator(indicator),
      VT_LOOKUP_CONCURRENCY,
    );
    return reports.filter((report): report is VtIndicatorReport => report !== null);
  }

  private async reportOnIndicator(indicator: ScanIndicator): Promise<VtIndicatorReport | null> {
    const cacheKey = `vt/${indicator.type}/${indicator.value}`;
    const cached = await this.cacheManager.get<VtIndicatorReport>(cacheKey);
    if (cached) {
      this.pino.debug({ type: indicator.type, value: indicator.value }, 'VirusTotal cache hit');
      return { ...cached, context: indicator.context };
    }

    const stored = await this.storedReport(indicator, cacheKey);
    if (stored) return stored;

    const stats =
      indicator.type === 'file' ? await this.lookupFile(indicator.value) : await this.scanUrl(indicator.value);
    if (stats === null) return null;

    const report: VtIndicatorReport = {
      type: indicator.type,
      value: indicator.value,
      context: indicator.context,
      verdict: verdictOf(stats),
      stats: stats === 'unknown' ? undefined : stats,
    };
    this.pino.debug({ type: indicator.type, value: indicator.value, verdict: report.verdict }, 'VirusTotal verdict');
    await this.cacheManager.set(cacheKey, report, VT_CACHE_TTL_MS);
    await this.recordVerdict(report).catch((err: unknown) =>
      this.pino.warn({ err }, 'Could not persist VirusTotal verdict'),
    );
    return report;
  }

  /** Serves a previously persisted verdict, sparing the API quota; re-primes the cache from the row. */
  private async storedReport(indicator: ScanIndicator, cacheKey: string): Promise<VtIndicatorReport | null> {
    const row = await this.findStoredVerdict(indicator);
    if (!row || row.malicious === null) return null;

    const stats = normalizeStats({
      malicious: row.malicious,
      suspicious: row.suspicious ?? 0,
      undetected: row.undetected ?? 0,
      harmless: row.harmless ?? 0,
      timeout: row.timeout ?? 0,
    });
    const report: VtIndicatorReport = {
      type: indicator.type,
      value: indicator.value,
      context: indicator.context,
      verdict: row.verdict,
      stats,
    };
    this.pino.debug({ type: indicator.type, value: indicator.value }, 'VirusTotal verdict store hit');
    await this.cacheManager.set(cacheKey, report, VT_CACHE_TTL_MS).catch(() => undefined);
    return report;
  }

  private async findStoredVerdict(indicator: ScanIndicator): Promise<VirusTotalVerdict | null> {
    if (!this.verdictRepository) return null;
    try {
      return await this.verdictRepository.findOne({ where: { type: indicator.type, value: indicator.value } });
    } catch {
      return null;
    }
  }

  private async recordVerdict(report: VtIndicatorReport): Promise<void> {
    if (!this.verdictRepository || report.verdict === 'clean' || report.verdict === 'unknown') return;
    const existing = await this.verdictRepository.findOne({ where: { type: report.type, value: report.value } });
    const stats = report.stats;
    if (existing) {
      existing.context = report.context;
      existing.verdict = report.verdict;
      if (stats) Object.assign(existing, statsToColumns(stats));
      await this.verdictRepository.save(existing);
      return;
    }
    await this.verdictRepository.save(
      this.verdictRepository.create({
        type: report.type,
        value: report.value,
        context: report.context,
        verdict: report.verdict,
        ...(stats ? statsToColumns(stats) : {}),
      }),
    );
  }

  async purgeOlderThan(maxAgeMs: number): Promise<number> {
    if (!this.verdictRepository) return 0;
    const cutoff = new Date(Date.now() - maxAgeMs);
    const result = await this.verdictRepository.delete({ createdAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredVerdicts(): Promise<void> {
    try {
      const purged = await this.purgeOlderThan(VERDICT_RETENTION_MS);
      if (purged > 0) this.pino.info({ count: purged }, 'Purged expired VirusTotal verdicts');
    } catch (err: unknown) {
      this.pino.error({ err }, 'Failed to purge expired VirusTotal verdicts');
    }
  }

  private async scanUrl(url: string): Promise<EngineStatsOrUnknown | null> {
    const known = await this.lookupUrlReport(url);
    if (known !== null) return known;

    const submit = await this.vtFetch('/urls', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url }).toString(),
    });
    if (submit === null || !submit.ok) {
      this.pino.warn({ url, status: submit?.status ?? 'network error' }, 'VirusTotal URL submission failed');
      return null;
    }
    const analysisId = ((await submit.json()) as VtSubmitResponse).data?.id;
    if (analysisId === undefined) return null;
    this.pino.debug({ url, analysisId }, 'Submitted URL for scanning');

    const pollIntervalMs = this.configService.get<number>('vt.pollIntervalMs') ?? DEFAULT_POLL_INTERVAL_MS;
    for (let attempt = 0; attempt < ANALYSIS_POLL_ATTEMPTS; attempt++) {
      await sleep(pollIntervalMs);
      const analysis = await this.vtFetch(`/analyses/${analysisId}`, { method: 'GET' });
      if (analysis === null || !analysis.ok) continue;
      const attributes = ((await analysis.json()) as VtAnalysisResponse).data?.attributes;
      if (attributes?.status === 'completed') return normalizeStats(attributes.stats);
      this.pino.debug({ analysisId, status: attributes?.status ?? 'unknown status' }, 'Analysis not finished yet');
    }
    return 'unknown';
  }

  /** VT indexes URL reports by unpadded base64; a hit returns finished stats without submitting a live scan. */
  private async lookupUrlReport(url: string): Promise<EngineStatsOrUnknown | null> {
    const id = Buffer.from(url).toString('base64').replace(/=+$/, '');
    const response = await this.vtFetch(`/urls/${id}`, { method: 'GET' });
    if (response === null || response.status === 404) return null;
    if (!response.ok) {
      this.pino.warn({ status: response.status }, 'VirusTotal URL report lookup failed');
      return null;
    }
    const stats = ((await response.json()) as VtStatsResponse).data?.attributes?.last_analysis_stats;
    return stats ? normalizeStats(stats) : null;
  }

  private async lookupFile(hash: string): Promise<EngineStatsOrUnknown | null> {
    const response = await this.vtFetch(`/files/${hash}`, { method: 'GET' });
    if (response === null) return null;
    if (response.status === 404) {
      this.pino.debug({ hash }, 'File unknown to VirusTotal');
      return 'unknown';
    }
    if (!response.ok) {
      this.pino.warn({ hash, status: response.status }, 'VirusTotal file lookup failed');
      return null;
    }
    return normalizeStats(((await response.json()) as VtStatsResponse).data?.attributes?.last_analysis_stats);
  }

  private async vtFetch(path: string, init: RequestInit): Promise<Response | null> {
    const spacingMs = this.configService.get<number>('vt.requestSpacingMs') ?? DEFAULT_REQUEST_SPACING_MS;
    const waitMs = this.lastRequestAt + spacingMs - Date.now();
    if (waitMs > 0) {
      this.pino.debug({ waitMs }, 'Waiting for VirusTotal rate limit');
      await sleep(waitMs);
    }
    this.lastRequestAt = Date.now();

    try {
      return await fetch(`${VT_API_BASE}${path}`, {
        ...init,
        headers: { 'x-apikey': this.configService.getOrThrow<string>('vt.apiKey'), ...init.headers },
        signal: AbortSignal.timeout(VT_TIMEOUT_MS),
      });
    } catch (err) {
      this.pino.warn({ err, path }, 'VirusTotal request failed');
      return null;
    }
  }
}

function verdictOf(stats: EngineStatsOrUnknown): VtVerdict {
  if (stats === 'unknown') return 'unknown';
  if (stats.malicious >= MALICIOUS_ENGINE_THRESHOLD) return 'malicious';
  if (stats.malicious + stats.suspicious >= SUSPICIOUS_ENGINE_THRESHOLD) return 'suspicious';
  return stats.harmless + stats.undetected > 0 ? 'clean' : 'unknown';
}

function normalizeStats(partial: Partial<VtEngineStats> | undefined): VtEngineStats {
  return {
    malicious: partial?.malicious ?? 0,
    suspicious: partial?.suspicious ?? 0,
    undetected: partial?.undetected ?? 0,
    harmless: partial?.harmless ?? 0,
    timeout: partial?.timeout ?? 0,
  };
}

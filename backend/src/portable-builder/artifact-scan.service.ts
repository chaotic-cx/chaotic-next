import type { VtIndicatorReport } from '@chaotic-next/shared-lib';
import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { PortableBuilderConfig } from '../config/portable-builder.config';
import { DiffScanService } from '../diff-scan/diff-scan.service';
import { extractIndicators, MAX_INDICATORS_PER_MR, type ScanIndicator } from '../diff-scan/indicators';
import { VirustotalService } from '../diff-scan/virustotal.service';
import { type CreateBuildContainerOptions, DockerService } from './docker.service';
import type { PortableArtifactScan } from './portable-build.entity';

const EXTRACT_SCRIPT = [
  'set -e',
  'mkdir /scan && cd /scan',
  'for f in /pkg/*.pkg.tar.zst; do bsdtar -xf "$f"; done',
  'find . -type f -exec sha256sum {} +',
  'find . -type f -size -2M -exec sh -c \'for f; do if grep -Iq . "$f"; then printf "===TEXT=== %s\\n" "${f#./}"; head -c 500000 "$f"; printf "\\n===END===\\n"; fi; done\' sh {} +',
].join('\n');

const CLAMAV_SCRIPT = 'freshclam --quiet; clamscan --infected --no-summary -r /scan';
const CLAMAV_FOUND_LINE = /^(.+): (.+) FOUND$/;

const MAX_DUMP_BYTES = 8 * 1024 * 1024;
const HASH_LINE = /^([0-9a-f]{64})\s{2}(.+)$/;
const TEXT_MARKER = '===TEXT=== ';
const END_MARKER = '===END===';

export interface ScannedArtifactFile {
  name: string;
  sha256: string;
  text: string | null;
}

export interface ClamavDetection {
  file: string;
  signature: string;
}

/** Parses `clamscan --infected` output lines ("path: Signature FOUND"). */
export function parseClamavOutput(output: string): ClamavDetection[] {
  return output
    .split('\n')
    .map((line) => CLAMAV_FOUND_LINE.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ file: match[1] ?? '', signature: match[2] ?? '' }));
}

/** Parses the sandbox output into per-file hashes and text contents. */
export function parseScanDump(dump: string): ScannedArtifactFile[] {
  const files = new Map<string, ScannedArtifactFile>();
  let textFile: string | null = null;
  let textChunks: string[] = [];

  const flushText = (): void => {
    if (textFile === null) return;
    const name = textFile;
    const text = textChunks.join('').replace(/\n===END===$/, '');
    const existing = files.get(name);
    if (existing) existing.text = text;
    else files.set(name, { name, sha256: '', text });
    textFile = null;
    textChunks = [];
  };

  for (const line of dump.split('\n')) {
    const hash = HASH_LINE.exec(line);
    if (hash) {
      flushText();
      const name = hash[2] ?? '';
      const sha256 = hash[1] ?? '';
      const existing = files.get(name);
      if (existing) existing.sha256 = sha256;
      else files.set(name, { name, sha256, text: null });
      continue;
    }

    if (line.startsWith(TEXT_MARKER)) {
      flushText();
      textFile = line.slice(TEXT_MARKER.length);
      continue;
    }

    if (textFile !== null) {
      if (line.trimEnd() === END_MARKER) flushText();
      else textChunks.push(`${line}\n`);
    }
  }
  flushText();
  return [...files.values()];
}

/** Scans built package artifacts inside a throwaway sandbox container. */
@Injectable()
export class ArtifactScanService {
  constructor(
    configService: ConfigService,
    private readonly docker: DockerService,
    private readonly diffScan: DiffScanService,
    private readonly virustotal: VirustotalService,
    @InjectPinoLogger(ArtifactScanService.name) private readonly pino: PinoLogger,
  ) {
    this.config = configService.getOrThrow<PortableBuilderConfig>('portable-builder');
  }

  private readonly config: PortableBuilderConfig;

  /** Extraction and hashing happen in a network-less container; rules and VirusTotal run in-process. */
  async scanArtifacts(options: {
    artifactDir: string;
    image: string;
    labels: Record<string, string>;
    buildId: number;
  }): Promise<PortableArtifactScan> {
    try {
      const dump = await this.dumpArtifactTree(options);
      const files = parseScanDump(dump);
      const changes = files
        .filter((file) => file.text !== null)
        .map((file) => fullFileDiff(file.name, file.text as string));
      const findings = await this.diffScan.scanDiffs(changes as MergeRequestDiffSchema[], undefined, 'full-file');
      const [virusTotal, clamavDetections] = await Promise.all([
        this.virusTotalVerdicts(files, changes as MergeRequestDiffSchema[]),
        this.scanWithClamav(options),
      ]);
      const infected = findings.length > 0 || (clamavDetections?.length ?? 0) > 0;

      return {
        status: infected ? 'findings' : 'clean',
        scannedFiles: files.length,
        findings,
        virusTotal,
        ...(clamavDetections === undefined ? {} : { clamavDetections }),
      };
    } catch (err) {
      this.pino.warn({ err }, 'Artifact scan failed');
      return { status: 'failed', scannedFiles: 0, findings: [], virusTotal: [] };
    }
  }

  /**
   * ClamAV over the extracted tree when a scanner image is configured. ClamAV cannot look inside
   * tar.zst archives, so the extraction container fills a scratch volume first.
   */
  private async scanWithClamav(options: {
    artifactDir: string;
    image: string;
    labels: Record<string, string>;
    buildId: number;
  }): Promise<ClamavDetection[] | undefined> {
    if (this.config.clamavImage === '') return undefined;
    const dbVolume = 'pb-clamav-db';
    const scratchVolume = `pb-scan-${options.buildId}`;
    try {
      await this.docker.ensureVolume(dbVolume);
      await this.docker.ensureVolume(scratchVolume);
      const extract = await this.docker.createBuildContainer({
        image: options.image,
        entrypoint: ['sh'],
        cmd: [
          '-c',
          'set -e; mkdir /scan 2>/dev/null || true; cd /scan; for f in /pkg/*.pkg.tar.zst; do bsdtar -xf "$f"; done',
        ],
        binds: [`${options.artifactDir}:/pkg:ro`, `${scratchVolume}:/scan`],
        env: [],
        labels: options.labels,
        hostConfig: { NetworkMode: 'none' },
      });
      const extractExit = await this.docker.startAndWait(extract, () => undefined);
      if (extractExit !== 0) throw new Error(`Artifact extraction for ClamAV exited with code ${extractExit}`);

      const clamav = await this.docker.createBuildContainer({
        image: this.config.clamavImage,
        entrypoint: ['sh'],
        cmd: ['-c', CLAMAV_SCRIPT],
        binds: [`${scratchVolume}:/scan:ro`, `${dbVolume}:/var/lib/clamav`],
        env: [],
        labels: options.labels,
      });
      const chunks: string[] = [];
      const clamavExit = await this.docker.startAndWait(clamav, (chunk) => chunks.push(chunk));
      if (clamavExit !== 0) throw new Error(`clamscan exited with code ${clamavExit}`);
      return parseClamavOutput(chunks.join(''));
    } catch (err) {
      this.pino.warn({ err }, 'ClamAV scan failed');
      return undefined;
    } finally {
      await this.docker.removeVolume(scratchVolume);
    }
  }

  private async dumpArtifactTree(options: {
    artifactDir: string;
    image: string;
    labels: Record<string, string>;
  }): Promise<string> {
    const containerOptions: CreateBuildContainerOptions = {
      image: options.image,
      entrypoint: ['sh'],
      cmd: ['-c', EXTRACT_SCRIPT],
      binds: [`${options.artifactDir}:/pkg:ro`],
      env: [],
      labels: options.labels,
      hostConfig: { NetworkMode: 'none' },
    };
    const container = await this.docker.createBuildContainer(containerOptions);
    const chunks: string[] = [];
    let total = 0;
    const exitCode = await this.docker.startAndWait(container, (chunk) => {
      if (total < MAX_DUMP_BYTES) {
        chunks.push(chunk);
        total += chunk.length;
      }
    });
    if (exitCode !== 0) throw new Error(`Artifact sandbox exited with code ${exitCode}`);
    return chunks.join('');
  }

  private async virusTotalVerdicts(
    files: ScannedArtifactFile[],
    changes: MergeRequestDiffSchema[],
  ): Promise<VtIndicatorReport[]> {
    if (!this.virustotal.enabled) return [];
    const indicators = new Map<string, ScanIndicator>();
    for (const file of files.filter((candidate) => candidate.text === null && candidate.sha256 !== '')) {
      indicators.set(file.sha256, { type: 'file', value: file.sha256, context: file.name });
    }
    for (const indicator of extractIndicators(changes)) {
      if (indicators.size >= MAX_INDICATORS_PER_MR) break;
      indicators.set(`${indicator.type}:${indicator.value}`, indicator);
    }
    if (indicators.size === 0) return [];
    return this.virustotal.reportOn([...indicators.values()].slice(0, MAX_INDICATORS_PER_MR));
  }
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

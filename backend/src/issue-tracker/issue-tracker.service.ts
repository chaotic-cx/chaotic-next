import { ConflictException, Injectable, type OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AurScanService } from '../diff-scan/aur-scan.service';
import { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import { Package } from '../builder/builder.entity';
import { suggestBuildClass } from '../builder/build-class-suggester';
import { formatContainerUsage, resourceStatsToUsage } from '../portable-builder/container-usage';
import type { PortableBuild } from '../portable-builder/portable-build.entity';
import { PortableBuilderService } from '../portable-builder/portable-builder.service';
import { EOL_RULE_ID } from '../diff-scan/eol-dependencies';
import { buildClassLabel, type BuildResourceStats } from '@chaotic-next/shared-lib';
import {
  BUILD_TEST_LABEL,
  CUSTOM_PACKAGE_LABEL,
  DUPLICATE_LABEL,
  GithubIssuesService,
  LEGACY_NEEDS_INPUT_LABEL,
  LIBRARY_EOL_LABEL,
  NEEDS_INPUT_LABEL,
  NEEDS_TRIAGE_LABEL,
  OFFICIAL_REPO_LABEL,
  TEMPLATE_VIOLATION_LABEL,
  type IssueCommentRef,
} from './github-issues.service';
import type { GithubIssueEventDto } from './issue-event.dto';
import { parsePackageRequest } from './issue-form.parser';
import { type AurPackageScan, type DiffScanSeverity, vtIndicatorLink } from '@chaotic-next/shared-lib';

/** Grace period for waiting:issuer-feedback is 7 days. */
export const NEEDS_INPUT_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const SCAN_POLL_INTERVAL_MS = 3_000;
// ponytail: caps the wait for VirusTotal enrichment; longer scans post without VT lines.
const SCAN_TERMINAL_TIMEOUT_MS = 90_000;

@Injectable()
export class IssueTrackerService implements OnModuleInit {
  constructor(
    private readonly github: GithubIssuesService,
    private readonly aurScan: AurScanService,
    private readonly portableBuilder: PortableBuilderService,
    @InjectRepository(Package)
    private readonly chaoticPackages: Repository<Package>,
    @InjectRepository(ArchlinuxPackage)
    private readonly archPackages: Repository<ArchlinuxPackage>,
    @InjectPinoLogger(IssueTrackerService.name) private readonly pino: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.portableBuilder.jobFinished$.subscribe((build) => {
      void this.reportTestBuildResult(build).catch((err: unknown) => {
        this.pino.error({ err, buildId: build.id }, 'Reporting the test build result failed');
      });
    });
  }

  async handleIssueEvent(payload: GithubIssueEventDto): Promise<void> {
    const issue = payload.issue;
    const waitsForIssuerFeedback = issue.labels.some(
      (label) => label.name === NEEDS_INPUT_LABEL || label.name === LEGACY_NEEDS_INPUT_LABEL,
    );
    if (payload.action === 'labeled') {
      if (payload.label?.name === BUILD_TEST_LABEL) {
        await this.queueTestBuild(issue.number, issue.title, issue.body ?? '');
      }
      return;
    }

    if (payload.action === 'opened') {
      await this.triage(issue.number, issue.title, issue.body ?? '');
      return;
    }

    // If the requester comments on the issue, count it as an answer.
    if (payload.action === 'created' && payload.comment !== undefined && waitsForIssuerFeedback) {
      const requester = issue.user?.login;
      if (requester !== undefined && payload.comment.user?.login === requester) {
        await this.triage(issue.number, issue.title, issue.body ?? '');
      }
      return;
    }

    if ((payload.action === 'edited' || payload.action === 'reopened') && waitsForIssuerFeedback) {
      await this.triage(issue.number, issue.title, issue.body ?? '');
    }
  }

  /**
   * Validate one issue.
   * Do not reject invalid issues. Post a comment and add the waiting tag.
   * Close the issue after 7 days without answer.
   * For valid requests, run the AUR scan and post one comment with the findings.
   */
  async triage(issueNumber: number, title: string, body: string): Promise<void> {
    // If the body has no ### section, close the issue. It has no template.
    if (!/^###\s/m.test(body)) {
      await this.github.createComment(
        issueNumber,
        'This request was not created with an issue template. Please resubmit it with the request or rebuild template.',
      );
      await this.github.addLabels(issueNumber, [TEMPLATE_VIOLATION_LABEL]).catch(() => undefined);
      await this.github.closeIssue(issueNumber);
      return;
    }

    const parsed = parsePackageRequest(title, body);
    if (!parsed.ok) {
      await this.postNeedsInput(
        issueNumber,
        `Thanks for the request. Some parts of the issue need attention:\n\n${formatFailures(parsed.failures)}\n\nPlease fix the sections above. The issue closes automatically in one week without an answer.`,
      );
      return;
    }

    const pkgbases = parsed.request.pkgbases;
    // If the custom box is checked, skip the AUR check. The scan cannot fetch it.
    const isCustomRebuild = 'custom' in parsed.request && parsed.request.custom;

    // For split packages, use one pkgbase. For several bases, open one request per base.
    let scanTargets = pkgbases;
    if (!isCustomRebuild) {
      const resolution = await this.github.resolveAurPackageBases(pkgbases);
      const missing = [...resolution].filter(([, base]) => base === null).map(([name]) => name);
      if (missing.length > 0) {
        const bullets = missing.map((name) => `- \`${name}\` does not exist in the AUR (yet?).`).join('\n');
        await this.postNeedsInput(
          issueNumber,
          `Thanks for the request. The following package bases could not be found in the AUR:\n\n${bullets}\n\nPlease check the link. The issue closes automatically in one week without an answer.`,
        );
        return;
      }
      const bases = [...new Set([...resolution.values()].filter((base): base is string => base !== null))];
      if (bases.length > 1) {
        await this.postNeedsInput(
          issueNumber,
          `Thanks for the request. It covers several package bases (${bases.map((base) => `\`${base}\``).join(', ')}). Please open one request per package base.`,
        );
        return;
      }
      scanTargets = bases;
    }

    if (parsed.kind === 'request') {
      const alreadyShipped = await this.findAlreadyPackaged(scanTargets);
      if (alreadyShipped !== null) {
        const where =
          alreadyShipped.where === 'chaotic'
            ? `the [chaotic-aur repository](${alreadyShipped.url})`
            : `the [official Arch Linux repositories](${alreadyShipped.url})`;
        if (alreadyShipped.where === 'official') {
          await this.github.addLabels(issueNumber, [OFFICIAL_REPO_LABEL]).catch(() => undefined);
        }
        await this.github.createComment(
          issueNumber,
          `Thanks for the request. This package is already available in ${where}. No request is necessary. Closing this request.`,
        );
        await this.github.closeIssue(issueNumber);
        return;
      }
    }

    const duplicate = await this.findDuplicate(issueNumber, parsed.kind, scanTargets);
    if (duplicate !== null) {
      await this.github.createComment(
        issueNumber,
        `Duplicate of #${duplicate}. Please subscribe to that issue instead.`,
      );
      await this.github.addLabels(issueNumber, [DUPLICATE_LABEL]);
      await this.github.closeIssue(issueNumber);
      return;
    }

    if (!isCustomRebuild) {
      await this.attachScanFindings(issueNumber, scanTargets);
    }
    const stateLabels = [NEEDS_TRIAGE_LABEL, ...(isCustomRebuild ? [CUSTOM_PACKAGE_LABEL] : [])];
    await this.github.addLabels(issueNumber, stateLabels).catch(() => undefined);
    await this.github.removeLabel(issueNumber, NEEDS_INPUT_LABEL).catch(() => undefined);
    await this.github.removeLabel(issueNumber, LEGACY_NEEDS_INPUT_LABEL).catch(() => undefined);
  }

  /** Close waiting:issuer-feedback issues without answer for 7 days. Use GitHub search. Keep no local state. */
  // ponytail: grace anchored on the bot's last issuer-feedback comment and the
  // local clock; switch to GitHub event timestamps if clock drift matters.
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweepStale(): Promise<void> {
    const stale = await this.github.findOpenIssuesLabeled(NEEDS_INPUT_LABEL);
    for (const { number: issueNumber } of stale) {
      try {
        await this.sweepOne(issueNumber);
      } catch (err) {
        this.pino.warn({ err, issueNumber }, 'Stale sweep step failed');
      }
    }
  }

  private async queueTestBuild(issueNumber: number, title: string, body: string): Promise<void> {
    const parsed = parsePackageRequest(title, body);
    const pkgbase = parsed.ok ? parsed.request.pkgbases[0] : undefined;
    if (pkgbase === undefined) {
      await this.github.createComment(
        issueNumber,
        'Cannot queue a test build: the pkgbase could not be determined from this issue.',
      );
      return;
    }
    try {
      await this.portableBuilder.enqueue(pkgbase, issueNumber);
    } catch (err: unknown) {
      if (err instanceof ConflictException) {
        await this.github.createComment(issueNumber, `A test build of \`${pkgbase}\` is already queued or running.`);
        return;
      }
      throw err;
    }
    await this.github.createComment(
      issueNumber,
      `Queued a test build of \`${pkgbase}\`. The result will be posted here once it finishes.`,
    );
  }

  private async reportTestBuildResult(build: PortableBuild): Promise<void> {
    if (build.issueNumber === null) return;
    const links = this.portableBuilder.linksFor(build);
    const lines: string[] = [];
    if (build.status === 'success') {
      lines.push(
        `Test build of \`${build.pkgbase}\` succeeded in ${formatDuration(build.resourceStats?.duration_ms ?? 0)}.`,
      );
      lines.push('');
      for (const url of links.artifactUrls) lines.push(`- Artifact: ${url}`);
    } else {
      const reason = build.status === 'timed-out' ? 'it became idle and was cancelled' : build.error;
      lines.push(`Test build of \`${build.pkgbase}\` failed: ${reason}.`);
      lines.push('');
    }
    lines.push(`- Full log: ${links.logUrl}`);
    if (build.resourceStats) {
      lines.push(`- Container usage: ${formatContainerUsage(resourceStatsToUsage(build.resourceStats))}`);
      const suggested = suggestBuildClass(toAverages(build.resourceStats));
      if (suggested !== null) lines.push(`- Suggested build class: ${buildClassLabel(suggested)}`);
    }
    const scan = build.scan;
    if (scan) {
      if (scan.status === 'failed') {
        lines.push('Artifact scan did not complete; the built package was not analyzed.');
      } else {
        const count =
          scan.findings.length === 0
            ? 'no findings'
            : scan.findings.length === 1
              ? '1 finding'
              : `${scan.findings.length} findings`;
        lines.push(`**Artifact scan**: ${count} across ${scan.scannedFiles} file(s)`);
        for (const severity of ['critical', 'warning', 'info'] as const) {
          const group = scan.findings.filter((finding) => finding.severity === severity);
          if (group.length === 0) continue;
          lines.push('', `> [!${GITHUB_ALERT_BY_SEVERITY[severity]}]`);
          for (const finding of group) {
            lines.push(`> - \`${finding.file}\` — **${finding.ruleName}**`);
          }
        }
        const flagged = scan.virusTotal.filter(
          (report) => report.verdict === 'malicious' || report.verdict === 'suspicious',
        );
        const detections = scan.clamavDetections ?? [];
        if (flagged.length > 0 || detections.length > 0) {
          lines.push('', '> [!WARNING]');
          for (const detection of detections) {
            lines.push(`> - ClamAV: **${detection.signature}** in \`${detection.file}\``);
          }
          for (const report of flagged) {
            lines.push(`> - VirusTotal: [${report.verdict}](${vtIndicatorLink(report)}) for \`${report.value}\``);
          }
        }
      }
    }
    const logTail = extractLogTail(build.log);
    if (logTail !== null && build.status !== 'success') {
      lines.push('Log tail:', '', '```', logTail, '```');
    }
    await this.github.createComment(build.issueNumber, lines.join('\n'));
    await this.github.removeLabel(build.issueNumber, BUILD_TEST_LABEL).catch(() => undefined);
  }

  private async sweepOne(issueNumber: number): Promise<void> {
    const issue = await this.github.getIssue(issueNumber);
    if (!issue) return;
    const comments = await this.github.listComments(issueNumber);
    const botLogin = await this.github.getBotLogin();
    if (botLogin === null) return;
    const lastBotComment = comments.findLast((comment) => comment.user?.login === botLogin);
    if (!lastBotComment) return;
    const taggedAt = new Date(lastBotComment.created_at);
    if (Date.now() - taggedAt.getTime() < NEEDS_INPUT_GRACE_MS) return;
    if (this.requesterAnswered(comments, issue.user, taggedAt)) {
      await this.triage(issueNumber, issue.title, issue.body);
      return;
    }
    await this.github.createComment(
      issueNumber,
      'Closing for now. The requested input was not provided within one week. Feel free to reopen with the missing information.',
    );
    await this.github.removeLabel(issueNumber, NEEDS_INPUT_LABEL).catch(() => undefined);
    await this.github.closeIssue(issueNumber);
  }

  // ponytail: scans pkgbases sequentially and waits up to 90s each; parallelize
  // or run detached if rebuild requests with many pkgbases become slow.
  private async attachScanFindings(issueNumber: number, pkgbases: string[]): Promise<void> {
    const summaries: string[] = [];
    const kinds = new Set<string>();
    let hasEolDependency = false;
    for (const pkgbase of pkgbases) {
      this.aurScan.startScan(pkgbase);
      const scan = await this.waitForTerminalScan(pkgbase);
      summaries.push(formatScanSummary(scan));
      for (const kind of scan?.pkgTypes ?? []) kinds.add(kind);
      if (scan?.findings.some((finding) => finding.ruleId === EOL_RULE_ID)) hasEolDependency = true;
    }
    await this.github.createComment(issueNumber, `Automated AUR scan results:\n\n${summaries.join('\n\n')}`);
    // ponytail: relies on the issues API auto-creating unknown labels; verify
    // manually if labels seem to go missing.
    const labels = [...kinds].map(kindLabel);
    if (hasEolDependency) labels.push(LIBRARY_EOL_LABEL);
    if (labels.length > 0) {
      await this.github.addLabels(issueNumber, labels).catch(() => undefined);
    }
  }

  private async waitForTerminalScan(packageName: string): Promise<AurPackageScan | null> {
    const deadline = Date.now() + SCAN_TERMINAL_TIMEOUT_MS;
    let scan = this.aurScan.getScan(packageName);
    while (scan !== null && (scan.status === 'scanning' || scan.status === 'awaiting-vt') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, SCAN_POLL_INTERVAL_MS));
      scan = this.aurScan.getScan(packageName);
    }
    return scan;
  }

  private requesterAnswered(comments: IssueCommentRef[], requester: string | null, after: Date): boolean {
    if (requester === null) return false;
    return comments.some((comment) => comment.user?.login === requester && new Date(comment.created_at) > after);
  }

  // Called from the Package insert subscriber.
  async closeFulfilledNewRequest(pkgbase: string): Promise<void> {
    const open = await this.github.findOpenRequestIssues(pkgbase);
    for (const issue of open.filter((candidate) => candidate.title.trim().startsWith('[Request]'))) {
      await this.github.createComment(
        issue.number,
        `The package is now available in the chaotic-aur repository. Thank you for the request. Closing it.`,
      );
      await this.github.closeIssue(issue.number);
    }
  }

  // Called from the Build insert subscriber.
  async closeFulfilledRebuild(pkgbase: string): Promise<void> {
    const open = await this.github.findOpenRequestIssues(pkgbase);
    for (const issue of open.filter((candidate) => candidate.title.trim().startsWith('[Rebuild]'))) {
      await this.github.createComment(
        issue.number,
        'A new build of this package is available in the chaotic-aur repository. Closing this request.',
      );
      await this.github.closeIssue(issue.number);
    }
  }

  private async postNeedsInput(issueNumber: number, body: string): Promise<void> {
    await this.github.createComment(issueNumber, body);
    await this.github.addLabels(issueNumber, [NEEDS_INPUT_LABEL]);
  }

  private async findAlreadyPackaged(bases: string[]): Promise<{ where: 'chaotic' | 'official'; url: string } | null> {
    const chaotic = await this.chaoticPackages.findOne({
      where: [{ pkgname: In(bases) }, { pkgbaseName: In(bases) }],
    });
    if (chaotic !== null) {
      const matched = chaotic.pkgbaseName ?? chaotic.pkgname;
      return {
        where: 'chaotic',
        url: `https://aur.chaotic.cx/stats/search?search=${encodeURIComponent(matched)}`,
      };
    }
    const official = await this.archPackages.findOne({ where: { pkgname: In(bases) } });
    if (official !== null) {
      return { where: 'official', url: `https://archlinux.org/packages/?q=${encodeURIComponent(official.pkgname)}` };
    }
    return null;
  }

  /**
   * Only issues of the same kind (Request vs Rebuild) count as duplicates;
   * `[Rebuild] foo` must never close `[Request] foo`.
   */
  private async findDuplicate(
    issueNumber: number,
    kind: 'request' | 'rebuild',
    pkgbases: string[],
  ): Promise<number | null> {
    const prefix = kind === 'request' ? '[Request]' : '[Rebuild]';
    for (const pkgbase of pkgbases) {
      const open = await this.github.findOpenRequestIssues(pkgbase);
      const other = open.find((issue) => issue.number !== issueNumber && issue.title.trim().startsWith(prefix));
      if (other !== undefined) return other.number;
    }
    return null;
  }
}

const COMMENT_LOG_TAIL_CHARS = 1500;

function toAverages(stats: BuildResourceStats) {
  return {
    avgPeakMemoryBytes: stats.peak_memory_bytes,
    avgCpuTimeNs: stats.cpu_time_ns,
    avgDiskIoBytes: stats.disk_read_bytes + stats.disk_write_bytes,
    avgDurationSeconds: stats.duration_ms / 1000,
  };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function extractLogTail(log: string | null): string | null {
  if (log === null || log.length === 0) return null;
  return log.length <= COMMENT_LOG_TAIL_CHARS ? log : log.slice(-COMMENT_LOG_TAIL_CHARS);
}

const AUR_SCAN_PAGE_URL = 'https://aur.chaotic.cx/aur-scan';
const GITHUB_ALERT_BY_SEVERITY: Record<DiffScanSeverity, string> = {
  critical: 'CAUTION',
  warning: 'WARNING',
  info: 'NOTE',
};

function formatScanSummary(scan: AurPackageScan | null): string {
  if (scan === null) return 'The scan did not produce a result in time. Check back later.';
  if (scan.status === 'failed') return `\`${scan.packageName}\`: the scan failed. A maintainer can rerun it.`;

  const count =
    scan.findings.length === 0
      ? 'no critical or warning findings'
      : scan.findings.length === 1
        ? '1 finding'
        : `${scan.findings.length} findings`;
  const lines = [
    `**\`${scan.packageName}\`**: ${count} — [full scan: PKGBUILD and sources](${AUR_SCAN_PAGE_URL}?search=${encodeURIComponent(scan.packageName)})`,
  ];
  for (const severity of ['critical', 'warning', 'info'] as const) {
    const group = scan.findings.filter((finding) => finding.severity === severity);
    if (group.length === 0) continue;
    lines.push('', `> [!${GITHUB_ALERT_BY_SEVERITY[severity]}]`);
    for (const finding of group) {
      const location = finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
      lines.push(`> - \`${location}\` — **${finding.ruleName}**`);
    }
  }
  const flagged = scan.vtReports.filter((report) => report.verdict === 'malicious' || report.verdict === 'suspicious');
  if (flagged.length > 0) {
    lines.push('', '> [!WARNING]');
    for (const report of flagged) {
      lines.push(`> - VirusTotal: [${report.verdict}](${vtIndicatorLink(report)}) for \`${report.value}\``);
    }
  }
  if (scan.packageMeta.orphaned) lines.push('', 'The package has no maintainer on the AUR.');
  else if (scan.packageMeta.outOfDate) lines.push('', 'The AUR shows this package as out-of-date.');
  if (scan.vtPending > 0) lines.push('VirusTotal analysis is still running.');
  return lines.join('\n');
}

function formatFailures(failures: { section: string; problem: string }[]): string {
  return failures.map((failure) => `- **${failure.section}**: ${failure.problem}`).join('\n');
}

/**
 * Package kinds become `info:` labels, following the upstream scheme
 * ("Packaged app is based on …"). The two kinds upstream already labels by
 * name reuse their exact spelling.
 */
const KIND_LABEL_OVERRIDES: Record<string, string> = {
  electron: 'info:electron',
  nodejs: 'info:node.js',
};

function kindLabel(kind: string): string {
  return KIND_LABEL_OVERRIDES[kind] ?? `info:${kind}`;
}

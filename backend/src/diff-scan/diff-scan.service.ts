import { type DiffScanFinding, type DiffScanSeverity } from '@chaotic-next/shared-lib';
import { type MergeRequestDiffSchema } from '@gitbeaker/core';
import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { posix } from 'node:path';
import { Repository } from 'typeorm';
import { Package } from '../builder/builder.entity';
import { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import { checkEolDependencies } from './eol-dependencies';
import { LlmScanService } from './llm-scan.service';
import { parsePkgbuild, parseSrcinfoVariables, registerSrcinfoVariables } from './pkgbuild';
import { RULES } from './rules';
import { maskEchoHeredocs } from './rules/diff-utils';
import { type GroupRuleHit, type RuleHit, ruleRunsOn, type RuleSurface } from './rules/rule';
import {
  type AurDependencyFetcher,
  isDependencyPresent,
  isSrcinfoFile,
  scanSrcinfoDependencies,
} from './srcinfo-dependency';
import { findTyposquatFinding } from './typosquat';

const MAX_FINDINGS_PER_MR = 100;
const MAX_MATCH_LENGTH = 300;

const SEVERITY_ORDER: Record<DiffScanSeverity, number> = { critical: 0, warning: 1, info: 2 };

export type MrAutoFlagLabel = 'suspicious' | 'malware';

export interface DiffScanVerdict {
  label: MrAutoFlagLabel;
  score: number;
  findings: DiffScanFinding[];
}

const SEVERITY_WEIGHTS: Record<DiffScanSeverity, number> = { critical: 10, warning: 3, info: 1 };
const MALWARE_SCORE_THRESHOLD = 10;
const SUSPICIOUS_SCORE_THRESHOLD = 4;

@Injectable()
export class DiffScanService {
  constructor(
    @InjectPinoLogger(DiffScanService.name) private readonly pino: PinoLogger,
    @Optional() private readonly llmScan?: LlmScanService,
    @Optional()
    @InjectRepository(ArchlinuxPackage)
    private readonly archPkgRepository?: Repository<ArchlinuxPackage>,
    @Optional()
    @InjectRepository(Package)
    private readonly packageRepository?: Repository<Package>,
  ) {}

  async scanDiffs(
    rawDiffs: MergeRequestDiffSchema[],
    isDepPresentOverride?: (depName: string) => Promise<boolean>,
    surface: RuleSurface = 'mr-diff',
    fetchAurDependencies?: AurDependencyFetcher,
    withLlm = true,
  ): Promise<DiffScanFinding[]> {
    const diffs = rawDiffs.map((change) => ({ ...change, diff: maskEchoHeredocs(change.diff) }));
    for (const rule of RULES) {
      if (!rule.load) continue;
      try {
        const { downloaded, stale } = await rule.load();
        if (downloaded) this.pino.info({ rule: rule.id }, 'Rule data loaded');
        else if (stale) this.pino.warn({ rule: rule.id }, 'Rule feed unavailable, matching against persisted data');
      } catch (err) {
        this.pino.warn({ err, rule: rule.id }, 'Rule data load failed');
      }
    }

    const findings: DiffScanFinding[] = [];

    const isDepPresent =
      isDepPresentOverride ??
      ((depName: string) => isDependencyPresent(depName, this.archPkgRepository, this.packageRepository));

    // Fold each .SRCINFO's literal scalars into its sibling PKGBUILD (matched by
    // directory) so untouched `url=`/`pkgver=` outside the diff hunks still resolve.
    const srcinfoVarsByDir = new Map<string, ReadonlyMap<string, string>>();
    for (const change of diffs) {
      if (isSrcinfoFile(change.new_path) && !change.deleted_file) {
        srcinfoVarsByDir.set(posix.dirname(change.new_path), parseSrcinfoVariables(change));
      }
    }

    for (const change of diffs) {
      if (change.deleted_file) continue;
      const vars = srcinfoVarsByDir.get(posix.dirname(change.new_path));
      if (vars) registerSrcinfoVariables(change, vars);

      for (const rule of RULES) {
        if (!ruleRunsOn(rule, surface)) continue;
        let hit: RuleHit | null;
        try {
          hit = rule.check(change);
        } catch (err) {
          this.pino.warn({ err, rule: rule.id, file: change.new_path }, 'Rule check failed');
          continue;
        }
        if (!hit) continue;
        findings.push(toScanFinding(rule, { ...hit, file: change.new_path }));
        if (findings.length >= MAX_FINDINGS_PER_MR) return sortFindings(findings);
      }

      if (isSrcinfoFile(change.new_path)) {
        try {
          const depFindings = await scanSrcinfoDependencies(change, isDepPresent, fetchAurDependencies);
          for (const depFinding of depFindings) {
            findings.push(depFinding);
            if (findings.length >= MAX_FINDINGS_PER_MR) return sortFindings(findings);
          }
        } catch (err) {
          this.pino.warn({ err, file: change.new_path }, 'SRCINFO dependency scan failed');
        }
      }

      try {
        const typoFinding = await findTyposquatFinding(change, this.archPkgRepository);
        if (!typoFinding) continue;
        findings.push(typoFinding);
        if (findings.length >= MAX_FINDINGS_PER_MR) return sortFindings(findings);
      } catch (err) {
        this.pino.warn({ err, file: change.new_path }, 'Typosquat check failed');
      }
    }

    for (const rule of RULES) {
      if (!rule.checkGroup || !ruleRunsOn(rule, surface)) continue;
      let hits: GroupRuleHit[];
      try {
        hits = rule.checkGroup(diffs);
      } catch (err) {
        this.pino.warn({ err, rule: rule.id }, 'Rule failed on multi-file scan');
        continue;
      }
      for (const hit of hits) findings.push(toScanFinding(rule, hit));
      if (findings.length >= MAX_FINDINGS_PER_MR) return sortFindings(findings);
    }
    findings.push(...(await this.checkEolDependencies(rawDiffs)));

    if (withLlm && this.llmScan) {
      try {
        const llmFindings = await this.llmScan.scan(diffs);
        findings.push(...llmFindings);
      } catch (err) {
        this.pino.warn({ err }, 'LLM scan failed');
      }
    }

    return sortFindings(findings);
  }

  /**
   * Checks dependency arrays of the PKGBUILD in the given changes against the
   * endoflife.date feeds. Reusable by every scan surface that carries a
   * PKGBUILD.
   */
  async checkEolDependencies(rawDiffs: MergeRequestDiffSchema[]): Promise<DiffScanFinding[]> {
    const pkgChange = rawDiffs.find((change) => !change.deleted_file && posix.basename(change.new_path) === 'PKGBUILD');
    if (!pkgChange) return [];
    const text = parsePkgbuild(pkgChange)?.text;
    if (!text) return [];
    return checkEolDependencies(text);
  }

  autoFlagVerdict(findings: DiffScanFinding[] | undefined): DiffScanVerdict | null {
    if (!findings || findings.length === 0) return null;
    const score = findings.reduce((sum, finding) => sum + SEVERITY_WEIGHTS[finding.severity], 0);
    if (score >= MALWARE_SCORE_THRESHOLD) return { label: 'malware', score, findings };
    if (score >= SUSPICIOUS_SCORE_THRESHOLD) return { label: 'suspicious', score, findings };
    return null;
  }
}

function toScanFinding(
  rule: { id: string; name: string; severity: DiffScanSeverity; description: string },
  hit: RuleHit & { file: string },
) {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    severity: hit.severity ?? rule.severity,
    description: [rule.description, hit.note].filter(Boolean).join(' '),
    file: hit.file,
    line: hit.line,
    match: hit.match.slice(0, MAX_MATCH_LENGTH),
  };
}

function sortFindings(findings: DiffScanFinding[]): DiffScanFinding[] {
  return findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
}

import { type DiffScanFinding, type DiffScanSeverity } from '@chaotic-next/shared-lib';
import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Package } from '../builder/builder.entity';
import { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import { errorMessage } from '../utils/functions';
import { RULES } from './rules';
import type { RuleHit, RuleSurface } from './rules/rule';
import { ruleRunsOn } from './rules/rule';
import { isDependencyPresent, isSrcinfoFile, scanSrcinfoDependencies } from './srcinfo-dependency';

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
  private readonly logger = new Logger(DiffScanService.name);

  constructor(
    @Optional()
    @InjectRepository(ArchlinuxPackage)
    private readonly archPkgRepository?: Repository<ArchlinuxPackage>,
    @Optional()
    @InjectRepository(Package)
    private readonly packageRepository?: Repository<Package>,
  ) {}

  async scanDiffs(
    diffs: MergeRequestDiffSchema[],
    isDepPresentOverride?: (depName: string) => Promise<boolean>,
    surface: RuleSurface = 'mr-diff',
  ): Promise<DiffScanFinding[]> {
    for (const rule of RULES) {
      if (!rule.load) continue;
      try {
        const { downloaded } = await rule.load();
        if (downloaded) this.logger.log(`Rule ${rule.id} data loaded`);
      } catch (err) {
        this.logger.warn(`Rule ${rule.id} data load failed: ${errorMessage(err)}`);
      }
    }

    const findings: DiffScanFinding[] = [];

    const isDepPresent =
      isDepPresentOverride ??
      ((depName: string) => isDependencyPresent(depName, this.archPkgRepository, this.packageRepository));

    for (const change of diffs) {
      if (change.deleted_file) continue;

      for (const rule of RULES) {
        if (!ruleRunsOn(rule, surface)) continue;
        let hit: RuleHit | null;
        try {
          hit = rule.check(change);
        } catch (err) {
          this.logger.warn(`Rule ${rule.id} failed on ${change.new_path}: ${errorMessage(err)}`);
          continue;
        }
        if (!hit) continue;
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: hit.severity ?? rule.severity,
          description: [rule.description, hit.note].filter(Boolean).join(' '),
          file: change.new_path,
          line: hit.line,
          match: hit.match.slice(0, MAX_MATCH_LENGTH),
        });
        if (findings.length >= MAX_FINDINGS_PER_MR) return sortFindings(findings);
      }

      if (isSrcinfoFile(change.new_path)) {
        try {
          const depFindings = await scanSrcinfoDependencies(change, isDepPresent);
          for (const depFinding of depFindings) {
            findings.push(depFinding);
            if (findings.length >= MAX_FINDINGS_PER_MR) return sortFindings(findings);
          }
        } catch (err) {
          this.logger.warn(`SRCINFO dependency scan failed on ${change.new_path}: ${errorMessage(err)}`);
        }
      }
    }
    return sortFindings(findings);
  }

  autoFlagVerdict(findings: DiffScanFinding[] | undefined): DiffScanVerdict | null {
    if (!findings || findings.length === 0) return null;
    const score = findings.reduce((sum, finding) => sum + SEVERITY_WEIGHTS[finding.severity], 0);
    if (score >= MALWARE_SCORE_THRESHOLD) return { label: 'malware', score, findings };
    if (score >= SUSPICIOUS_SCORE_THRESHOLD) return { label: 'suspicious', score, findings };
    return null;
  }
}

function sortFindings(findings: DiffScanFinding[]): DiffScanFinding[] {
  return findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
}

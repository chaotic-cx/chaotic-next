import {
  type AurMaintainerChange,
  type AurMaintainerInfo,
  type DiffScanSeverity,
  totalEngines,
  type VtIndicatorReport,
  type VtVerdict,
} from '@chaotic-next/shared-lib';
import { marker } from '@jsverse/transloco-keys-manager/marker';

type FindingTagSeverity = 'danger' | 'warn' | 'info';
type VtTagSeverity = 'danger' | 'warn' | 'success' | 'info';

/**
 * A translation key plus its params.
 * Pure helpers return it, and the template translates the key with the params.
 */
export interface TranslatableText {
  key: string;
  params?: Record<string, unknown>;
}

export const FINDING_SEVERITY: Record<DiffScanSeverity, FindingTagSeverity> = {
  critical: 'danger',
  warning: 'warn',
  info: 'info',
};

export const VT_VERDICT_SEVERITY: Record<VtVerdict, VtTagSeverity> = {
  malicious: 'danger',
  suspicious: 'warn',
  clean: 'success',
  unknown: 'info',
};

export const VT_VERDICT_LABELS: Record<VtVerdict, string> = {
  malicious: marker('aurScan.verdict.malicious'),
  suspicious: marker('aurScan.verdict.suspicious'),
  clean: marker('aurScan.verdict.clean'),
  unknown: marker('aurScan.verdict.unknown'),
};

export function vtEngines(report: VtIndicatorReport): TranslatableText {
  if (!report.stats) return { key: marker('aurScan.vt.noEngineData') };

  const flagged = report.stats.malicious + report.stats.suspicious;

  return {
    key: marker('aurScan.vt.enginesFlagged'),
    params: { flagged, total: totalEngines(report.stats) },
  };
}

export function findingCount(count: number): TranslatableText {
  if (count === 1) return { key: marker('aurScan.findingCountOne'), params: { count } };

  return { key: marker('aurScan.findingCountOther'), params: { count } };
}

// One explanation per PKGBUILD kind the backend classifier can emit.
export const PKG_TYPE_EXPLANATIONS: Record<string, string> = {
  'electron': marker('aurScan.pkgType.electron'),
  'nodejs': marker('aurScan.pkgType.nodejs'),
  'kernel-module': marker('aurScan.pkgType.kernelModule'),
  'python': marker('aurScan.pkgType.python'),
  'ruby': marker('aurScan.pkgType.ruby'),
  'perl': marker('aurScan.pkgType.perl'),
  'php': marker('aurScan.pkgType.php'),
  'java': marker('aurScan.pkgType.java'),
  'dotnet': marker('aurScan.pkgType.dotnet'),
  'haskell': marker('aurScan.pkgType.haskell'),
  'rust': marker('aurScan.pkgType.rust'),
  'go': marker('aurScan.pkgType.go'),
  'compiled': marker('aurScan.pkgType.compiled'),
  'font': marker('aurScan.pkgType.font'),
  'theme': marker('aurScan.pkgType.theme'),
  'extension': marker('aurScan.pkgType.extension'),
  'firmware': marker('aurScan.pkgType.firmware'),
  'prebuilt': marker('aurScan.pkgType.prebuilt'),
  'shell': marker('aurScan.pkgType.shell'),
  'meta': marker('aurScan.pkgType.meta'),
};

export function pkgTypeExplanation(kind: string): string | undefined {
  return PKG_TYPE_EXPLANATIONS[kind];
}

const YEAR_LENGTH = 4;

// The calendar year of an ISO date string.
function submissionYear(iso: string): string {
  return iso.slice(0, YEAR_LENGTH);
}

// Same source as the global LOCALE_ID provider in app.config.ts.
const BROWSER_LOCALE = navigator.language;
const MONTH_YEAR = new Intl.DateTimeFormat(BROWSER_LOCALE, { month: 'short', year: 'numeric' });

/**
 * The registration month and year of a maintainer, or `null` when the date is invalid.
 */
export function maintainerSince(maintainer: AurMaintainerInfo): string | null {
  const date = new Date(maintainer.registeredDate);
  if (Number.isNaN(date.getTime())) return null;

  return MONTH_YEAR.format(date);
}

export function maintainerSummary(maintainer: AurMaintainerInfo): TranslatableText {
  const since = maintainerSince(maintainer);
  const counts = { packages: maintainer.packagesMaintained, votes: maintainer.totalVotes };

  if (since === null) return { key: marker('aurScan.maintainers.summaryUnknownSince'), params: counts };

  return { key: marker('aurScan.maintainers.summary'), params: { ...counts, since } };
}

const MONTH_DAY = new Intl.DateTimeFormat(BROWSER_LOCALE, { month: 'short', day: 'numeric' });

/**
 * The added and removed maintainers with the detection date, or `null` when nothing changed.
 */
export function maintainerChangeSummary(change: AurMaintainerChange): TranslatableText | null {
  const parts: string[] = [];
  if (change.added.length > 0) {
    parts.push(`+${change.added.join(', ')}`);
  }
  if (change.removed.length > 0) {
    parts.push(`-${change.removed.join(', ')}`);
  }

  if (parts.length === 0) return null;

  return {
    key: marker('aurScan.maintainerChange.summary'),
    params: { changes: parts.join(' '), date: MONTH_DAY.format(new Date(change.detectedAt)) },
  };
}

export function tookOverByNovice(change: AurMaintainerChange, maintainers: AurMaintainerInfo[]): boolean {
  return change.added.some((username) => maintainers.find((m) => m.username === username)?.novice === true);
}

export const presenter = {
  findingSeverity: FINDING_SEVERITY,
  vtVerdictSeverity: VT_VERDICT_SEVERITY,
  vtVerdictLabels: VT_VERDICT_LABELS,
  submissionYear,
  vtEngines,
  findingCount,
  maintainerSince,
  maintainerSummary,
  maintainerChangeSummary,
  tookOverByNovice,
  pkgTypeExplanation,
};

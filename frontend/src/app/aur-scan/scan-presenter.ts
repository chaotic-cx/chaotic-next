import {
  type AurMaintainerChange,
  type AurMaintainerInfo,
  type DiffScanSeverity,
  totalEngines,
  type VtIndicatorReport,
  type VtVerdict,
} from '@chaotic-next/shared-lib';

type FindingTagSeverity = 'danger' | 'warn' | 'info';
type VtTagSeverity = 'danger' | 'warn' | 'success' | 'info';

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

export function vtEngines(report: VtIndicatorReport): string {
  if (!report.stats) return 'no engine data';
  const flagged = report.stats.malicious + report.stats.suspicious;
  return `${flagged}/${totalEngines(report.stats)} engines flagged`;
}

/** One explanation per PKGBUILD kind the backend classifier can emit. */
export const PKG_TYPE_EXPLANATIONS: Record<string, string> = {
  'electron': 'The package wraps an Electron application.',
  'nodejs': 'The package builds or runs with the Node.js runtime.',
  'kernel-module': 'The package builds or installs a Linux kernel module.',
  'python': 'The package depends on Python tooling.',
  'ruby': 'The package depends on Ruby tooling.',
  'perl': 'The package depends on Perl tooling.',
  'php': 'The package depends on PHP tooling.',
  'java': 'The package depends on Java tooling.',
  'dotnet': 'The package depends on the .NET framework.',
  'haskell': 'The package depends on the Haskell toolchain.',
  'rust': 'The package builds with Cargo.',
  'go': 'The package builds with the Go toolchain.',
  'compiled': 'The package is built natively from source.',
  'font': 'The package name matches a font profile.',
  'theme': 'The package name matches a theme or icon profile.',
  'extension': 'The package name matches an extension profile.',
  'firmware': 'The package name matches a firmware profile.',
  'prebuilt': 'The package ships prebuilt binaries. The PKGBUILD repackages them.',
  'shell': 'The package depends on shell runtimes.',
  'meta': 'The package has no source and no build function. It pulls dependencies only.',
};

export function pkgTypeExplanation(kind: string): string | undefined {
  return PKG_TYPE_EXPLANATIONS[kind];
}

const YEAR_LENGTH = 4;

/** The calendar year of an ISO date string. */
function submissionYear(iso: string): string {
  return iso.slice(0, YEAR_LENGTH);
}

/** Same source as the global LOCALE_ID provider in app.config.ts. */
const BROWSER_LOCALE = navigator.language;
const MONTH_YEAR = new Intl.DateTimeFormat(BROWSER_LOCALE, { month: 'short', year: 'numeric' });

export function maintainerSince(maintainer: AurMaintainerInfo): string {
  const date = new Date(maintainer.registeredDate);
  return Number.isNaN(date.getTime()) ? 'unknown' : MONTH_YEAR.format(date);
}

export function maintainerSummary(maintainer: AurMaintainerInfo): string {
  const since = maintainerSince(maintainer);
  return `${maintainer.packagesMaintained} package(s) · since ${since} · ${maintainer.totalVotes} votes`;
}

const MONTH_DAY = new Intl.DateTimeFormat(BROWSER_LOCALE, { month: 'short', day: 'numeric' });

export function maintainerChangeSummary(change: AurMaintainerChange): string {
  const parts: string[] = [];
  if (change.added.length > 0) parts.push(`+${change.added.join(', ')}`);
  if (change.removed.length > 0) parts.push(`-${change.removed.join(', ')}`);
  if (parts.length === 0) return '';
  return `${parts.join(' ')} since ${MONTH_DAY.format(new Date(change.detectedAt))}`;
}

export function tookOverByNovice(change: AurMaintainerChange, maintainers: AurMaintainerInfo[]): boolean {
  return change.added.some((username) => maintainers.find((m) => m.username === username)?.novice === true);
}

export const presenter = {
  findingSeverity: FINDING_SEVERITY,
  vtVerdictSeverity: VT_VERDICT_SEVERITY,
  submissionYear,
  vtEngines,
  maintainerSince,
  maintainerSummary,
  maintainerChangeSummary,
  tookOverByNovice,
  pkgTypeExplanation,
};

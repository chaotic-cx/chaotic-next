/**
 * GitHub issue forms render answers as `### <label>` headings followed by the
 * answer text. These match the labels in .github/ISSUE_TEMPLATE of
 * chaotic-aur/packages. Checkboxes render as GitHub task lists.
 */

const REQUEST_TITLE_PATTERN = /^\[(Request|Rebuild|Issue)]\s+(\S+)\s*$/;

// Requesters mix up both AUR URL shapes and often paste them without a
// scheme; the name resolves through the AUR RPC either way.
const AUR_PKGBASE_URL = /^(?:https?:\/\/)?aur\.archlinux\.org\/(?:pkgbase|packages)\/([A-Za-z0-9_.@+-]+)\/?\s*$/;

/** One `### Label` section of a rendered issue-form body. */
interface FormSection {
  label: string;
  body: string;
}

export function splitFormSections(body: string): FormSection[] {
  const sections: FormSection[] = [];
  const heading = /^### (.+)$/gm;
  let match: RegExpExecArray | null;
  const starts: { label: string; bodyStart: number; bodyEnd: number }[] = [];
  while ((match = heading.exec(body)) !== null) {
    starts.push({
      label: match[1].trim(),
      bodyStart: match.index + match[0].length,
      bodyEnd: match.index,
    });
  }
  for (const [index, start] of starts.entries()) {
    const end = index + 1 < starts.length ? starts[index + 1].bodyEnd : body.length;
    sections.push({ label: start.label, body: body.slice(start.bodyStart, end).trim() });
  }
  return sections;
}

export interface ParsedPackageRequest {
  pkgbases: string[];
  purpose: string;
  license: string;
}

export interface ParsedRebuildRequest {
  pkgbases: string[];
  description: string;
  custom: boolean;
}

export interface ParsedPackageIssue {
  pkgbases: string[];
  issueType: string;
  description: string;
  logs: string;
}

/**
 * All validation failures short of an AUR lookup: unparseable title, missing
 * sections, unanswerable sections, or malformed AUR links. Each entry becomes
 * one bullet in the bot's issuer-feedback comment.
 */
export interface ParseFailure {
  section: string;
  problem: string;
}

export type ParseResult =
  | {
      ok: true;
      kind: 'request' | 'rebuild' | 'issue';
      request: ParsedPackageRequest | ParsedRebuildRequest | ParsedPackageIssue;
    }
  | { ok: false; failures: ParseFailure[] };

function extractPkgbases(section: string): { names: string[]; failures: string[] } {
  const names: string[] = [];
  const failures: string[] = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('_')) continue;
    const urlMatch = trimmed.match(AUR_PKGBASE_URL);
    if (urlMatch) {
      names.push(urlMatch[1]);
      continue;
    }
    if (/^https?:\/\//.test(trimmed)) {
      failures.push(trimmed);
    } else if (/^[A-Za-z0-9_.@+-]+$/.test(trimmed)) {
      names.push(trimmed);
    } else {
      failures.push(trimmed);
    }
  }
  return { names, failures };
}

function addEmptySectionFailure(failures: ParseFailure[], section: string, answer: string): void {
  if (answer.length === 0 || answer === '_No response_') {
    failures.push({ section, problem: `The ${section} section is empty.` });
  }
}

// Common SPDX license identifiers plus everyday spellings of them. The full
// list lives at https://spdx.org/licenses.
const OPEN_SOURCE_LICENSE_REGEX =
  /\b((?:agpl|lgpl|gpl)(?:v?\d[\d.]*)?|affero|general public license|mit|bsd|apache|mozilla|mpl|isc|unlicense|wtfpl|zlib|cc0|cc-by|cecill|cddl|epl|eupl|artistic|ncsa|postgresql|openssl|osl|afl|hpnd|python|ms-pl|ms-rl|sip|openvpn|sissl|wap)\b/;

function addLicenseFailure(failures: ParseFailure[], answer: string): void {
  if (answer.length === 0 || answer === '_No response_') {
    failures.push({ section: 'License', problem: 'The License section is empty.' });
    return;
  }
  const normalized = answer.toLowerCase();
  if (!OPEN_SOURCE_LICENSE_REGEX.test(normalized)) {
    failures.push({
      section: 'License',
      problem: `"${answer.trim()}" is not a recognized open-source license. Use an SPDX identifier, see https://spdx.org/licenses.`,
    });
  }
}

const UNCHECKED_TASK_REGEX = /^- \[ \]/m;
const CUSTOM_PACKAGE_REGEX = /^- \[[xX]\][^\n]*custom package/im;
const REBUILD_CONFIRM_REGEX = /^- \[[xX]\][^\n]*rebuild of the same pkgbase/im;
const ISSUE_TYPE_VALUES = [
  'Build failure',
  'Wrong/missing dependency',
  'Install/runtime issue',
  'Other packaging issue',
] as const;

function addSubmissionChecklistFailures(failures: ParseFailure[], body: string): void {
  const checklist = splitFormSections(body).find((section) => section.label === 'Submission checklist');
  if (checklist && UNCHECKED_TASK_REGEX.test(checklist.body)) {
    failures.push({ section: 'Submission checklist', problem: 'Some checklist items are not confirmed.' });
  }
}

export function parsePackageRequest(title: string, body: string): ParseResult {
  const titleMatch = title.trim().match(REQUEST_TITLE_PATTERN);
  if (!titleMatch) {
    return {
      ok: false,
      failures: [
        {
          section: 'Title',
          problem: 'The title must be `[Request] package_name`, `[Rebuild] package_name` or `[Issue] package_name`.',
        },
      ],
    };
  }
  const kind = titleMatch[1] as 'Request' | 'Rebuild' | 'Issue';
  const sections = new Map(splitFormSections(body).map((section) => [section.label, section.body]));

  if (kind === 'Request') {
    const failures: ParseFailure[] = [];
    const packageSection = sections.get('Package') ?? '';
    const { names, failures: badLines } = extractPkgbases(packageSection);
    for (const bad of badLines) {
      failures.push({
        section: 'Package',
        problem: `The AUR package link is not in the expected form: ${bad}`,
      });
    }
    if (names.length === 0) {
      failures.push({ section: 'Package', problem: 'The Package section must contain at least one AUR package link.' });
    }
    const purpose = sections.get('Purpose') ?? '';
    addEmptySectionFailure(failures, 'Purpose', purpose);
    const license = sections.get('License') ?? '';
    addLicenseFailure(failures, license);
    addSubmissionChecklistFailures(failures, body);
    if (failures.length > 0) return { ok: false, failures };
    return { ok: true, kind: 'request', request: { pkgbases: names, purpose, license } };
  }

  if (kind === 'Rebuild') {
    const failures: ParseFailure[] = [];
    const { names } = extractPkgbases(sections.get('Packages') ?? '');
    const pkgbases = names.length > 0 ? names : [titleMatch[2]];
    const description = sections.get('Description') ?? '';

    addEmptySectionFailure(failures, 'Description', description);

    const hasConfirmationSection = splitFormSections(body).some((s) => s.label === 'Confirmation');
    if (hasConfirmationSection && !REBUILD_CONFIRM_REGEX.test(body)) {
      failures.push({
        section: 'Confirmation',
        problem: 'Please confirm this is a rebuild of the same pkgbase, not a packaging change.',
      });
    }
    if (failures.length > 0) return { ok: false, failures };

    return { ok: true, kind: 'rebuild', request: { pkgbases, description, custom: CUSTOM_PACKAGE_REGEX.test(body) } };
  }

  const failures: ParseFailure[] = [];
  const { names } = extractPkgbases(sections.get('Package') ?? '');
  const pkgbases = names.length > 0 ? names : [titleMatch[2]];
  const issueType = sections.get('Issue type') ?? '';
  if (!ISSUE_TYPE_VALUES.includes(issueType as (typeof ISSUE_TYPE_VALUES)[number])) {
    failures.push({
      section: 'Issue type',
      problem: `Select an issue type: ${ISSUE_TYPE_VALUES.join(', ')}.`,
    });
  }

  const description = sections.get('Issue description') ?? sections.get('Description') ?? '';
  addEmptySectionFailure(failures, 'Issue description', description);
  const logs = sections.get('Logs') ?? '';
  if (issueType === 'Build failure' && (logs.length === 0 || logs === '_No response_')) {
    failures.push({ section: 'Logs', problem: 'Build failure issues must include logs / error output.' });
  }
  if (failures.length > 0) return { ok: false, failures };

  return { ok: true, kind: 'issue', request: { pkgbases, issueType, description, logs } };
}

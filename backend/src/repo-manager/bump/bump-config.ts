/**
 * The `.CI/config` key whose value a bump updates. The match requires the
 * trailing `=`, so a key like `CI_PACKAGE_BUMP_PROXY` is left untouched.
 */
const BUMP_KEY = 'CI_PACKAGE_BUMP';

/** The key above which the bump line is inserted when absent (matches repo convention). */
const TRIGGER_KEY = 'CI_REBUILD_TRIGGERS';

export function parseCiConfig(configText: string): Record<string, string | undefined> {
  const configs: Record<string, string | undefined> = {};
  for (const line of configText.split('\n')) {
    const separator = line.indexOf('=');
    if (separator < 0) continue;
    configs[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return configs;
}

const BUILDER_CLASS_KEY = 'BUILDER_CLASS';

/** Rewrites the `BUILDER_CLASS` line of a `.CI/config`, appending one at the end when absent */
export function applyBuilderClass(configText: string, buildClass: number): string {
  const lines = configText.split('\n');
  const classLine = `${BUILDER_CLASS_KEY}=${buildClass}`;
  const idx = lines.findIndex((line) => line.startsWith(`${BUILDER_CLASS_KEY}=`));
  if (idx >= 0) {
    lines[idx] = classLine;
    return lines.join('\n');
  }

  const prefix = configText === '' || configText.endsWith('\n') ? configText : `${configText}\n`;
  return `${prefix}${classLine}\n`;
}

export function applyPackageBump(
  configText: string,
  version: string | null | undefined,
  pkgrel: number | null | undefined,
): string {
  const lines = configText.split('\n');
  const idx = lines.findIndex((line) => line.startsWith(`${BUMP_KEY}=`));

  // The `.CI/config` base is `version-pkgrel` (integer pkgrel); the `/counter`
  // suffix is the Chaotic-AUR rebuild indicator and is what gets incremented.
  if (idx >= 0) {
    if (version == null || pkgrel == null) {
      // A never-rebuilt package may have no tracked version; the recorded base
      // is the only truth — rewrite it as "null-0" and we deploy a garbage build.
      lines[idx] = bumpCounter(lines[idx]);
      return lines.join('\n');
    }
    const newBase = `${version}-${pkgrel}`;
    lines[idx] = `${BUMP_KEY}=${newBase}/${nextBumpCount(lines[idx], newBase)}`;
    return lines.join('\n');
  }

  if (version == null || pkgrel == null) {
    throw new Error(`Cannot bump: package version and pkgrel are unknown and no ${BUMP_KEY} line exists to preserve`);
  }

  const newBase = `${version}-${pkgrel}`;
  const bumpLine = `${BUMP_KEY}=${newBase}/1`;

  const triggerIdx = lines.findIndex((line) => line.startsWith(`${TRIGGER_KEY}=`));
  if (triggerIdx >= 0) {
    lines.splice(triggerIdx, 0, bumpLine);
    return lines.join('\n');
  }

  const pkgbuildSourceIdx = lines.findIndex((line) => line.startsWith('CI_PKGBUILD_SOURCE='));
  if (pkgbuildSourceIdx >= 0) {
    lines.splice(pkgbuildSourceIdx, 0, bumpLine);
    return lines.join('\n');
  }

  const prefix = configText === '' || configText.endsWith('\n') ? configText : `${configText}\n`;
  return `${prefix}${bumpLine}\n`;
}

/** Bump only the `/counter` of an existing bump line, preserving its recorded base. */
function bumpCounter(bumpLine: string): string {
  const value = bumpLine.slice(BUMP_KEY.length + 1); // text after `CI_PACKAGE_BUMP=`
  const slash = value.lastIndexOf('/');
  if (slash < 0) return `${BUMP_KEY}=${value}/1`; // no counter → start fresh
  const base = value.slice(0, slash);
  const counter = value.slice(slash + 1);
  const next = /^\d+$/.test(counter) ? Number(counter) + 1 : 1;
  return `${BUMP_KEY}=${base}/${next}`;
}

function nextBumpCount(bumpLine: string, newBase: string): number {
  const value = bumpLine.slice(BUMP_KEY.length + 1); // text after `CI_PACKAGE_BUMP=`
  const slash = value.lastIndexOf('/');
  if (slash < 0) return 1; // no counter → start fresh
  const existingBase = value.slice(0, slash);
  const existingCounter = value.slice(slash + 1);
  if (existingBase === newBase && /^\d+$/.test(existingCounter)) {
    return Number(existingCounter) + 1;
  }
  return 1;
}

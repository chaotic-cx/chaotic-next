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

export function applyPackageBump(configText: string, version: string, pkgrel: number): string {
  // The `.CI/config` base is `version-pkgrel` (integer pkgrel); the `/counter`
  // suffix is the Chaotic-AUR rebuild indicator and is what gets incremented.
  const newBase = `${version}-${pkgrel}`;
  const bumpLine = `${BUMP_KEY}=${newBase}/1`;
  const lines = configText.split('\n');
  const idx = lines.findIndex((line) => line.startsWith(`${BUMP_KEY}=`));

  if (idx >= 0) {
    lines[idx] = `${BUMP_KEY}=${newBase}/${nextBumpCount(lines[idx], newBase)}`;
    return lines.join('\n');
  }

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

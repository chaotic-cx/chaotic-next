import { compareArchVersions } from '../signal';

/**
 * The previous version, or the newest older analyzed version when the previous one was never analyzed. A removed package has no current version.
 */
export function pickBaselineVersion(
  analyzedVersions: string[],
  previousVersion: string,
  currentVersion: string | null,
): string | null {
  if (analyzedVersions.includes(previousVersion)) return previousVersion;

  const older = analyzedVersions.filter(
    (version) => currentVersion === null || compareArchVersions(version, currentVersion) < 0,
  );
  if (older.length === 0) return null;

  let newest = older[0];
  for (const version of older) {
    if (compareArchVersions(version, newest) > 0) {
      newest = version;
    }
  }

  return newest;
}

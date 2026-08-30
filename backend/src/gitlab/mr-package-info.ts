import { MrPackageInfo } from '@chaotic-next/shared-lib';
import { type Gitlab } from '@gitbeaker/rest';

export function parsePkgbuildSource(configText: string): string {
  const match = configText.match(/^CI_PKGBUILD_SOURCE=(.*)$/m);
  return match ? match[1].trim() : '';
}

export function parseManageAur(configText: string): boolean {
  return /^CI_MANAGE_AUR=true$/m.test(configText);
}

export function parseNvchecker(configText: string): boolean {
  return /^CI_NVCHECKER=true$/m.test(configText);
}

export function parseRebuildTriggers(configText: string): string[] {
  const match = configText.match(/^CI_REBUILD_TRIGGERS=(.*)$/m);
  if (!match) return [];
  return match[1]
    .split(':')
    .map((trigger) => trigger.trim())
    .filter((trigger) => trigger !== '');
}

/**
 * Reads a package's `.CI` folder listing and `CI_PKGBUILD_SOURCE` from the
 * pkgbuilds repo. Returns `null` when the folder cannot be read (e.g. the
 * package has no `.CI` folder or the repo is unreachable).
 */
export async function fetchPackageInfo(
  api: Gitlab,
  projectId: string | number,
  pkgname: string,
  logger?: { warn: (message: string) => void },
): Promise<MrPackageInfo | null> {
  try {
    const tree = await api.Repositories.allRepositoryTrees(projectId, {
      path: `${pkgname}/.CI`,
      recursive: false,
      ref: 'main',
      pagination: 'keyset',
      orderBy: 'name',
      sort: 'asc',
    });
    const ciFiles = tree.map((entry) => entry.name);

    let pkgbuildSource = '';
    let manageAur = false;
    let nvchecker = false;
    let rebuildTriggers: string[] = [];
    try {
      const raw = await api.RepositoryFiles.showRaw(projectId, `${pkgname}/.CI/config`, 'main');
      const text = typeof raw === 'string' ? raw : await raw.text();
      pkgbuildSource = parsePkgbuildSource(text);
      manageAur = parseManageAur(text);
      nvchecker = parseNvchecker(text);
      rebuildTriggers = parseRebuildTriggers(text);
    } catch {
      // The package may have a `.CI` folder without a `config` file.
    }

    return { pkgname, ciFiles, pkgbuildSource, manageAur, rebuildTriggers, nvchecker };
  } catch {
    logger?.warn(`Could not read .CI info for ${pkgname}`);
    return null;
  }
}

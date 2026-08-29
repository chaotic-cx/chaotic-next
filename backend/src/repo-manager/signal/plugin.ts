import { TriggerType } from '../../interfaces/repo-manager';
import { type PackageElfPkgType } from '../repo-manager.entity';
import { extractVtableSlots } from './abi';
import {
  ancestorDirectories,
  dedupe,
  isElfSharedObject,
  parentDirectory,
  parseDefinedSymbols,
  parseFileList,
  parseNmSymbolsWithSize,
  parseReadelfDynamic,
  parseReadelfRelocations,
  parseUndefinedSymbols,
  sonameBasename,
} from './parse';
import { type PackageElfAnalysis } from '@chaotic-next/shared-lib';

/** Directory-ownership index used for plugin detection. */
export interface DirectoryIndex {
  direct: Map<string, string[]>;
  ancestors: Map<string, string[]>;
  keyToPkgname: Map<string, string>;
  /** owner key -> the file paths it ships (used to detect shadowing forks). */
  keyToFiles: Map<string, Set<string>>;
}

/**
 * Metadata entries that exist in every archive. They sit at the archive root
 * and never indicate a payload, so they must not count as files a consumer
 * shadows (replaces).
 */
const PACKAGE_METADATA_FILES = new Set([
  '.BUILDINFO',
  '.MTREE',
  '.PKGINFO',
  '.INSTALL',
  '.CHANGELOG',
  '.AURINFO',
  '.SRCINFO',
  '.FILELIST',
]);

export function isPackageMetadata(file: string): boolean {
  return !file.includes('/') && PACKAGE_METADATA_FILES.has(file);
}

/**
 * Python site-packages dirs are version-generic: every python package ships
 * into `usr/lib/python<minor>/site-packages`, so installs there must not count
 * as plugin ownership. Extend the minor list when Arch bumps python.
 */
const PYTHON_GENERIC_MINORS = [12, 13, 14, 15];

/**
 * Generic system directories that are shared by almost every package. A
 * package installing files under these is NOT a plugin of the packages that
 * also install files there (they are not package-specific namespaces).
 */
const GENERIC_DIRS = new Set<string>([
  'usr',
  'usr/lib',
  'usr/lib64',
  'usr/lib32',
  'usr/bin',
  'usr/sbin',
  'usr/share',
  'usr/include',
  'usr/etc',
  'usr/src',
  'usr/local',
  'bin',
  'sbin',
  'lib',
  'lib64',
  'etc',
  'opt',
  'var',
  'var/lib',
  'var/log',
  'var/cache',
  'usr/share/doc',
  'usr/share/man',
  'usr/share/info',
  'usr/share/licenses',
  'usr/share/pixmaps',
  'usr/share/icons',
  'usr/share/locale',
  'usr/share/zoneinfo',
  'usr/share/applications',
  'usr/share/gtk-doc',
  'usr/share/mime',
  'usr/share/fonts',
  'usr/share/systemd',
  'usr/lib/systemd',
  'usr/lib/udev',
  'usr/lib/modules',
  'usr/lib/firmware',
  'usr/lib/pkgconfig',
  'usr/lib/cmake',
  'usr/share/gir-1.0',
  'usr/share/dbus-1',
  'usr/share/polkit-1',
  'usr/share/bash-completion',
  'usr/share/fish',
  'usr/share/zsh',
  'usr/share/desktop-directories',
  'usr/share/sounds',
  'usr/share/glib-2.0',
  'usr/share/gsettings-schemas',
  'usr/share/installed-tests',
  'usr/share/metainfo',
  'usr/share/vala',
  'etc/xdg',
  'etc/profile.d',
  ...PYTHON_GENERIC_MINORS.map((minor) => `usr/lib/python3.${minor}/site-packages`),
]);

export function deriveDirectoriesOwned(files: string[]): string[] {
  const dirs = new Set<string>();
  for (const file of files) {
    for (const dir of ancestorDirectories(file)) dirs.add(dir);
  }
  return dedupe([...dirs]).sort();
}

/**
 * A directory owned by more than this many packages is a shared namespace, not
 * a plugin dir. The namespace rule still admits some shared dirs that contain
 * an owner name, so this guard drops those with many owners.
 */
const SHARED_DIRECTORY_MAX_OWNERS = 10;

/**
 * Suffixes that mark the same upstream package rebuilt from another channel.
 * `fooyin` and `fooyin-git` are one program, not a plugin host and its plugin.
 */
const BUILD_VARIANT_SUFFIXES = [
  '-git',
  '-bin',
  '-stable',
  '-svn',
  '-cvs',
  '-hg',
  '-bzr',
  '-nightly',
  '-latest',
  '-master',
  '-unstable',
  '-testing',
  '-rc',
  '-dev',
  '-preview',
];

export function packageFamilyName(name: string): string {
  for (const suffix of BUILD_VARIANT_SUFFIXES) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  }
  return name;
}

export function samePackageFamily(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return packageFamilyName(a) === packageFamilyName(b);
}

/**
 * Ownership-credibility cap: no real package is a plugin of more than this
 * many owners. A result above this count means the directory index produced
 * garbage (e.g. stale owners on shared directories); such results are
 * re-verified against directory-name matches and discarded when none remain.
 */
const MAX_CREDIBLE_PLUGIN_OWNERS = 100;

export interface DerivePluginOfOptions {
  consumerPkgname?: string | null;
  hasCompiledCode?: boolean;
  isSourceCompiled?: boolean;
}

function addOwnersNamedInSegments(
  plugins: Set<string>,
  owners: string[],
  dir: string,
  keyToPkgname: Map<string, string>,
): void {
  const segments = dir.split('/');
  for (const owner of owners) {
    if (!owner) continue;
    const name = keyToPkgname.get(owner);
    if (name && segments.includes(name)) plugins.add(owner);
  }
}

function collectPluginCandidates(files: string[], index: DirectoryIndex): Set<string> {
  const plugins = new Set<string>();
  for (const file of files) {
    const parent = parentDirectory(file);
    if (!parent) continue;
    const direct = index.direct.get(parent);
    if (direct && !GENERIC_DIRS.has(parent) && direct.length <= SHARED_DIRECTORY_MAX_OWNERS) {
      addOwnersNamedInSegments(plugins, direct, parent, index.keyToPkgname);
    }
    const ancestors = ancestorDirectories(parent);
    for (const dir of [parent, ...ancestors]) {
      if (GENERIC_DIRS.has(dir)) continue;
      const owners = index.ancestors.get(dir);
      if (owners) addOwnersNamedInSegments(plugins, owners, dir, index.keyToPkgname);
    }
  }
  return plugins;
}

export function derivePluginOf(files: string[], index: DirectoryIndex, options: DerivePluginOfOptions = {}): string[] {
  const { consumerPkgname = null, hasCompiledCode = false, isSourceCompiled = false } = options;
  if (!hasCompiledCode && !isSourceCompiled) return [];

  const plugins = collectPluginCandidates(files, index);

  // A build variant of the consumer (fooyin-git vs fooyin) installs into the
  // same own-namespace dir, so it can look like a plugin of the base.
  for (const owner of plugins) {
    if (samePackageFamily(consumerPkgname, index.keyToPkgname.get(owner))) plugins.delete(owner);
  }

  // A consumer that ships a file the owner also ships shadows the owner (a fork
  // like ungoogled-chromium-bin), so it is not a plugin of it. A plugin only
  // adds its own files. It never replaces the host's files. Any shared file
  // path means the consumer is the same software rebuilt, not an ABI consumer.
  for (const owner of plugins) {
    const ownerFiles = index.keyToFiles.get(owner);
    if (ownerFiles && files.some((file) => ownerFiles.has(file))) plugins.delete(owner);
  }

  const result = dedupe([...plugins]).sort();
  if (result.length === 0) return result;
  if (result.length <= MAX_CREDIBLE_PLUGIN_OWNERS) return result;

  const filteredByDir = result.filter((ownerKey) => {
    const ownerName = index.keyToPkgname.get(ownerKey);
    if (!ownerName) return false;

    return files.some((file) => {
      const parent = parentDirectory(file);
      if (!parent) return false;

      const directOwners = index.direct.get(parent);
      if (directOwners?.includes(ownerKey)) {
        return !GENERIC_DIRS.has(parent) && parent.includes(ownerName);
      }

      return false;
    });
  });

  // A huge candidate set that no direct directory-name evidence supports is
  // index garbage, not a plugin relationship.
  return filteredByDir.length > 0 ? filteredByDir : [];
}

export function buildAnalysis(opts: {
  version: string;
  fileList: string;
  readelfByFile: Map<string, string>;
  importsByFile: Map<string, string>;
  exportsByFile: Map<string, string>;
  relocationsByFile: Map<string, string>;
  nmSizesByFile: Map<string, string>;
}): PackageElfAnalysis {
  const files = parseFileList(opts.fileList);

  // Every ELF object the scanner extracted and confirmed (shared objects AND
  // executables) contributes its DT_NEEDED sonames and undefined symbols. Only
  // shared objects carry a SONAME / exported symbols.
  const elfFiles = dedupe([...opts.readelfByFile.keys(), ...opts.importsByFile.keys(), ...opts.exportsByFile.keys()]);

  const needed = new Set<string>();
  const provided = new Set<string>();
  const imported = new Set<string>();
  const exported: Record<string, string[]> = {};
  const vtables: Record<string, string[]> = {};

  for (const file of elfFiles) {
    const readelf = opts.readelfByFile.get(file);
    if (readelf) {
      const { needed: fileNeeded, soname } = parseReadelfDynamic(readelf);
      for (const n of fileNeeded) needed.add(n);
      if (isElfSharedObject(file)) {
        // A library without a SONAME is still resolvable by its filename at
        // runtime (DT_NEEDED records the filename), so the basename counts as
        // provided. E.g. tcl ships libtcl8.6.so without a SONAME.
        const providedName = soname ?? sonameBasename(file);
        provided.add(providedName);
        const defined = opts.exportsByFile.get(file);
        if (defined) exported[providedName] = dedupe(parseDefinedSymbols(defined)).sort();
        const relocations = opts.relocationsByFile.get(file);
        const nmSizes = opts.nmSizesByFile.get(file);
        if (relocations && nmSizes) {
          const slots = extractVtableSlots(parseReadelfRelocations(relocations), parseNmSymbolsWithSize(nmSizes));
          for (const vtable of slots) vtables[vtable.symbol] = vtable.slots;
        }
      }
    }
    const imports = opts.importsByFile.get(file);
    if (imports) {
      for (const sym of parseUndefinedSymbols(imports)) imported.add(sym);
    }
  }

  const directoriesOwned = deriveDirectoriesOwned(files);
  const directDirectories = dedupe(files.map(parentDirectory).filter((d): d is string => d !== null)).sort();

  const hasCompiledCode = needed.size > 0 || provided.size > 0;

  return {
    version: opts.version,
    files,
    neededSonames: dedupe([...needed]).sort(),
    providedSonames: dedupe([...provided]).sort(),
    importedSymbols: dedupe([...imported]).sort(),
    exportedSymbols: exported,
    vtables,
    directoriesOwned,
    directDirectories,
    pluginOf: [],
    broken: false,
    brokenReasons: [],
    hasCompiledCode,
    isSourceCompiled: false,
    scannedAt: new Date().toISOString(),
  };
}

/** The signal pkgType discriminator values (see PackageElfPkgType). */
export const ARCH_PKG_TYPE: PackageElfPkgType = '0';
export const CHAOTIC_PKG_TYPE: PackageElfPkgType = '1';

export function pkgTypeOf(triggerFrom: TriggerType): PackageElfPkgType {
  return triggerFrom === TriggerType.ARCH ? ARCH_PKG_TYPE : CHAOTIC_PKG_TYPE;
}

export function triggerTypeOf(pkgType: PackageElfPkgType): TriggerType {
  return pkgType === ARCH_PKG_TYPE ? TriggerType.ARCH : TriggerType.CHAOTIC;
}

export function encodeOwnerKey(pkgType: TriggerType, pkgId: number): string {
  return `${pkgType === TriggerType.ARCH ? 'a' : 'c'}${pkgId}`;
}

export function decodeOwnerKey(key: string): { pkgType: TriggerType; pkgId: number } | null {
  const match = /^([ac])(\d+)$/.exec(key);
  if (!match) return null;
  return {
    pkgType: match[1] === 'a' ? TriggerType.ARCH : TriggerType.CHAOTIC,
    pkgId: Number(match[2]),
  };
}

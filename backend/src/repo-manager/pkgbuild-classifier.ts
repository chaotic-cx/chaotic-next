/**
 * Standard binary package name suffixes in Arch/AUR ecosystems.
 */
const BINARY_PACKAGE_SUFFIX_REGEX = /-(?:bin|appimage|snap|flatpak|bundled(?:-[a-zA-Z0-9_-]+)?)(?:-(?:git|nightly))?$/i;

/**
 * Common precompiled package and standalone distribution archive formats.
 */
const BINARY_PACKAGE_EXTENSIONS_REGEX =
  /\.(?:deb|rpm|appimage|dmg|run|apk|jar|snap|pkg\.tar(?:\.[a-z0-9]+)?)(?:["'\s?#]|$)/i;

/**
 * Standard build/compilation tool indicators in makedepends or PKGBUILD content.
 */
const COMPILER_TOOLS_REGEX =
  /\b(?:cmake|ninja|meson|gcc|g\+\+|clang|clang\+\+|cargo|rustc|go|go-pie|ghc|dotnet|mvn|gradle|ant|bazel|make|autoconf|automake|qmake|setuptools)\b/i;

/**
 * Unpacking and repackaging tools commonly used in binary repackaging PKGBUILDs.
 */
const EXTRACTION_COMMANDS_REGEX =
  /\b(?:dpkg-deb|ar\s+-[a-zA-Z]*x|rpmextract(?:\.sh)?|bsdtar\s+-[a-zA-Z]*x|unsquashfs|7z\s+[xe]|unzip|tar\s+-[a-zA-Z]*x)\b/i;

/**
 * Extracts a bash array definition from PKGBUILD text (e.g. `source=(...)` or `arch=(...)`).
 */
export function extractArray(pkgbuildText: string, name: string): string[] | null {
  const match = pkgbuildText.match(new RegExp(`(?:^|\\s)${name}=\\(([\\s\\S]*?)\\)`, 'm'));
  return match ? match[1].split(/\s+/).filter((entry) => entry.length > 0) : null;
}

/**
 * Determines whether a package is a precompiled binary package
 * based on its name suffix and PKGBUILD content analysis.
 */
export function isBinaryPackage(pkgname: string, pkgbuildText?: string | null): boolean {
  // 1. Name suffix (e.g. *-bin, *-appimage, *-snap, *-flatpak, *-bundled)
  if (BINARY_PACKAGE_SUFFIX_REGEX.test(pkgname)) {
    return true;
  }

  if (!pkgbuildText) {
    return false;
  }

  // 2. PKGBUILD signals
  const options = extractArray(pkgbuildText, 'options') ?? [];
  const hasNoStrip = options.some((opt) => opt.includes('!strip'));

  const makedepends = extractArray(pkgbuildText, 'makedepends') ?? [];
  const hasCompilerInMakedepends = makedepends.some((dep) => COMPILER_TOOLS_REGEX.test(dep));

  const sources = [
    ...(extractArray(pkgbuildText, 'source') ?? []),
    ...(extractArray(pkgbuildText, 'source_x86_64') ?? []),
    ...(extractArray(pkgbuildText, 'source_aarch64') ?? []),
    ...(extractArray(pkgbuildText, 'source_i686') ?? []),
  ];

  const hasExplicitBinarySource =
    sources.some((src) => BINARY_PACKAGE_EXTENSIONS_REGEX.test(src.replace(/^["']|["']$/g, ''))) ||
    BINARY_PACKAGE_EXTENSIONS_REGEX.test(pkgbuildText);

  const hasPrebuiltArchiveSource = sources.some(
    (src) =>
      /-bin\./i.test(src) ||
      /-linux\./i.test(src) ||
      /-x86_64\./i.test(src) ||
      /\.(?:zip|tar\.gz|tgz|tar\.xz)\b/i.test(src),
  );

  const isSourcePrecompiledRelease = sources.some(
    (src) => /-bin\./i.test(src) || /-linux\./i.test(src) || /-x86_64\./i.test(src),
  );

  const hasBuildFunction = /(?:^|\n)\s*build\s*\(\s*\)/m.test(pkgbuildText);
  const usesExtractionCommands = EXTRACTION_COMMANDS_REGEX.test(pkgbuildText);

  // Case A: Downloads binary distribution packages (.deb, .rpm, .appimage, .run, etc.)
  // and does not compile native C/C++/Rust code.
  if (hasExplicitBinarySource && (!hasBuildFunction || usesExtractionCommands || !hasCompilerInMakedepends)) {
    return true;
  }

  // Case B: Explicitly skips stripping (!strip) with no compiler in makedepends.
  if (hasNoStrip && !hasCompilerInMakedepends && (!hasBuildFunction || usesExtractionCommands)) {
    return true;
  }

  // Case C: Upstream source is precompiled binary release (e.g. -bin.tar.gz) without compiling
  if (isSourcePrecompiledRelease && !hasCompilerInMakedepends) {
    return true;
  }

  // Case D: No build function or only desktop/trivial in build(), no compiler in makedepends,
  // and fetches prebuilt archives / extracts binaries directly into opt/ or usr/.
  if (!hasCompilerInMakedepends && (hasExplicitBinarySource || hasPrebuiltArchiveSource)) {
    if (!hasBuildFunction || usesExtractionCommands || /install\s+-(?:dm755|d).*opt\//i.test(pkgbuildText)) {
      return true;
    }
  }

  // Case D: Downloads proprietary .run/.deb/.rpm installers/plugins inside prepare() or build()
  // and copies precompiled shared libraries (.so) directly to package destination.
  if (/(?:curl|wget)\b.*?\.(?:run|deb|rpm)\b/i.test(pkgbuildText) || /sh\s+.*?\.run\s+--target/i.test(pkgbuildText)) {
    if (/install\s+.*\.so\b/i.test(pkgbuildText) || /cp\s+.*\.so\b/i.test(pkgbuildText)) {
      return true;
    }
  }

  return false;
}

const BINARY_PACKAGE_SUFFIX_REGEX = /-(?:bin|appimage|snap|flatpak|bundled(?:-[a-zA-Z0-9_-]+)?)(?:-(?:git|nightly))?$/i;
const BINARY_PACKAGE_EXTENSIONS_REGEX =
  /\.(?:deb|rpm|appimage|dmg|run|apk|jar|snap|pkg\.tar(?:\.[a-z0-9]+)?)(?:["'\s?#]|$)/i;
const COMPILER_TOOLS_REGEX =
  /\b(?:cmake|ninja|meson|gcc|g\+\+|clang|clang\+\+|cargo|rust|rustc|go|go-pie|ghc|dotnet|mvn|gradle|ant|bazel|make|autoconf|automake|qmake|setuptools|bison|flex|libtool|perl|python|java|gradlew)\b/i;
const EXTRACTION_COMMANDS_REGEX =
  /\b(?:dpkg-deb|ar\s+-[a-zA-Z]*x|rpmextract(?:\.sh)?|bsdtar\s+-[a-zA-Z]*x|unsquashfs|7z\s+[xe]|unzip|tar\s+-[a-zA-Z]*x)\b/i;
const ELECTRON_REGEX = /electron/i;
const NODEJS_PACKAGE_REGEX = /nodejs|npm|yarn|pnpm/i;
const NODEJS_BUILD_REGEX = /\bnpm\s|npm\srun\b|yarn\s|pnpm\s|node\s/i;
const NO_STRIP_REGEX = /options=\([^)]*!strip[^)]*\)/m;
const AUTOTOOLS_REGEX = /(?:autoreconf|configure|Makefile\.in|AM_CONFIG_FILE|AC_CONFIG_HEADERS)\b/i;
const MAKE_COMMAND_REGEX = /(?:^|\n)\s*make\s+[^\s(]/m;
const QT_QMAKE_REGEX = /(?:qmake|qt\d+-base|qt\d+-tools|qt\d+-declarative)\b/i;
const MESON_REGEX = /(?:meson|meson-python)\b/i;
const NINJA_REGEX = /\bninja\b/i;
const BUILD_FUNCTION_REGEX = /(?:^|\n)\s*build\s*\(\s*\)/m;
const STRIP_COMMENT_LINES_REGEX = /^[ \t]*#.*/gm;

export function extractArray(pkgbuildText: string, name: string): string[] | null {
  const match = pkgbuildText.match(new RegExp(`(?:^|\\s)${name}=\\(([\\s\\S]*?)\\)`, 'm'));
  return match ? match[1].split(/\s+/).filter((entry) => entry.length > 0) : null;
}

function stripComments(pkgbuildText: string): string {
  return pkgbuildText.replace(STRIP_COMMENT_LINES_REGEX, '');
}

function hasBuildFunction(pkgbuildText: string): boolean {
  return BUILD_FUNCTION_REGEX.test(pkgbuildText);
}

function isNodejsPackage(depends: string[], makedepends: string[], pkgbuildText: string): boolean {
  const hasElectronInDepends = depends.some((dep) => ELECTRON_REGEX.test(dep));
  const hasNodejsInMakedepends = makedepends.some((dep) => NODEJS_PACKAGE_REGEX.test(dep));
  const hasNodejsInBuild = NODEJS_BUILD_REGEX.test(pkgbuildText);
  return hasElectronInDepends || hasNodejsInMakedepends || hasNodejsInBuild;
}

function hasBuildSystemIndicator(pkgbuildText: string): boolean {
  return (
    AUTOTOOLS_REGEX.test(pkgbuildText) ||
    MAKE_COMMAND_REGEX.test(pkgbuildText) ||
    QT_QMAKE_REGEX.test(pkgbuildText) ||
    MESON_REGEX.test(pkgbuildText) ||
    NINJA_REGEX.test(pkgbuildText)
  );
}

function hasCompilerInList(deps: string[]): boolean {
  return deps.some((dep) => COMPILER_TOOLS_REGEX.test(dep));
}

function collectAllDepends(pkgbuildText: string): { depends: string[]; makedepends: string[]; allDepends: string[] } {
  const makedepends = extractArray(pkgbuildText, 'makedepends') ?? [];
  const depends = extractArray(pkgbuildText, 'depends') ?? [];
  const dependsX8664 = extractArray(pkgbuildText, 'depends_x86_64') ?? [];
  const dependsI686 = extractArray(pkgbuildText, 'depends_i686') ?? [];
  return { depends, makedepends, allDepends: [...depends, ...dependsX8664, ...dependsI686] };
}

export function isBinaryPackage(pkgname: string, pkgbuildText?: string | null): boolean {
  if (BINARY_PACKAGE_SUFFIX_REGEX.test(pkgname)) {
    return true;
  }

  if (!pkgbuildText) {
    return false;
  }

  const options = extractArray(pkgbuildText, 'options') ?? [];
  const hasNoStrip = options.some((opt) => opt.includes('!strip'));

  const makedepends = extractArray(pkgbuildText, 'makedepends') ?? [];
  const hasCompilerInMakedepends = hasCompilerInList(makedepends);

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

  const hasBuildFunc = hasBuildFunction(pkgbuildText);
  const usesExtractionCommands = EXTRACTION_COMMANDS_REGEX.test(pkgbuildText);

  if (hasExplicitBinarySource && (!hasBuildFunc || usesExtractionCommands || !hasCompilerInMakedepends)) {
    return true;
  }

  if (hasNoStrip && !hasCompilerInMakedepends && (!hasBuildFunc || usesExtractionCommands)) {
    return true;
  }

  if (isSourcePrecompiledRelease && !hasCompilerInMakedepends) {
    return true;
  }

  if (!hasCompilerInMakedepends && (hasExplicitBinarySource || hasPrebuiltArchiveSource)) {
    if (!hasBuildFunc || usesExtractionCommands || /install\s+-(?:dm755|d).*opt\//i.test(pkgbuildText)) {
      return true;
    }
  }

  if (/(?:curl|wget)\b.*?\.(?:run|deb|rpm)\b/i.test(pkgbuildText) || /sh\s+.*?\.run\s+--target/i.test(pkgbuildText)) {
    if (/install\s+.*\.so\b/i.test(pkgbuildText) || /cp\s+.*\.so\b/i.test(pkgbuildText)) {
      return true;
    }
  }

  return false;
}

export function isSourceCompiledPackage(pkgbuildText?: string | null): boolean {
  if (!pkgbuildText) {
    return false;
  }

  const cleanText = stripComments(pkgbuildText);
  const { makedepends, allDepends } = collectAllDepends(cleanText);

  if (isNodejsPackage(allDepends, makedepends, cleanText)) {
    return false;
  }

  const hasCompilerInMakedepends = hasCompilerInList(makedepends);
  const hasCompilerInDepends = hasCompilerInList(allDepends);
  const hasBuildFunc = hasBuildFunction(cleanText);
  const hasNoStripOption = !NO_STRIP_REGEX.test(cleanText);
  const hasBuildSystem = hasBuildSystemIndicator(cleanText);

  const hasAnyCompiler = hasCompilerInMakedepends || hasCompilerInDepends || hasBuildSystem;

  return hasAnyCompiler && hasBuildFunc && hasNoStripOption;
}

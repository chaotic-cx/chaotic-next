const COMPILER_TOOLS_REGEX =
  /\b(?:cmake|ninja|meson|gcc|g\+\+|clang|clang\+\+|cargo|rust|rustc|go|go-pie|ghc|dotnet|mvn|gradle|ant|bazel|make|autoconf|automake|qmake|setuptools|bison|flex|libtool|perl|python|java|gradlew)\b/i;
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

/** Kind → runtime dependency name pattern (version constraints stripped before matching). */
const KIND_DEP_REGEXES: readonly (readonly [string, RegExp])[] = [
  ['python', /^python|^(?:setuptools|pip|wheel)$|^python-/],
  ['ruby', /^ruby/],
  ['perl', /^perl/],
  ['php', /^php/],
  ['java', /^(?:java-environment|jdk|jre|openjdk|gradle|maven|apache-ant)\b|^ant\b/],
  ['dotnet', /^dotnet/],
  ['haskell', /^(?:ghc|happy|stack)\b|^haskell-/],
];

const KERNEL_MODULE_DEP_REGEX = /^(?:dkms|linux(?:-[a-z0-9]+)*-headers)$/;
const NODEJS_DEP_REGEX = /^nodejs$/;
// A native toolchain turns node build steps into an implementation detail
// (Firefox runs pnpm; it is not a nodejs package).
const NATIVE_TOOLCHAIN_REGEX = /^(?:clang|clang\+\+|gcc|g\+\+|rust|cargo|go)$/;
const SHELL_DEPENDS_REGEX = /^(?:bash|zsh|fish|dash|sh)$/;

/** Kind → PKGBUILD build-command pattern; proves the ecosystem for statically linked builds. */
const KIND_BUILD_REGEXES: readonly (readonly [string, RegExp])[] = [
  ['rust', /\bcargo (?:build|install)\b/],
  ['go', /\bgo (?:build|install)\b/],
  ['python', /\b(?:setup\.py|pip install|pyproject\.toml)\b/],
  ['ruby', /\bgem install\b/],
  ['php', /\bcomposer install\b/],
  ['java', /\b(?:gradle|mvn|ant)\b/],
];

const PKGNAME_REGEX = /^pkgname\s*=\s*\(?\s*([^\s(]+)/m;
const PREBUILT_NAME_REGEX = /-(?:bin|appimage|deb|binary)$/;
const FONT_NAME_REGEX = /(^|-)fonts?$|^ttf-|^otf-|-ttf$|-otf$|-otb$/;
const THEME_NAME_REGEX = /theme|icons?|cursors?|wallpaper/;
const EXTENSION_NAME_REGEX = /extension|kwin-script|applet|plasmoid/;
const FIRMWARE_NAME_REGEX = /-firmware$/;
const META_PKGBUILD_REGEX = /^source\s*=/m;

function stripComments(pkgbuildText: string): string {
  return pkgbuildText.replace(STRIP_COMMENT_LINES_REGEX, '');
}

function matchesKind(deps: string[], regex: RegExp): boolean {
  return deps.some((dep) =>
    regex.test(
      dep
        .replace(/[<=>].*$/, '')
        .replace(/['"]/g, '')
        .trim(),
    ),
  );
}

export function extractArray(pkgbuildText: string, name: string, multiline = false): string[] | null {
  const inner = multiline ? '[\\s\\S]*?' : '[^)]*';
  const match = pkgbuildText.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*\\((${inner})\\)`, 'm'));
  if (!match) return null;
  return match[1]
    .split(/\s+/)
    .filter((entry) => entry.length > 0 && entry !== '\\')
    .flatMap(expandBraceAlternation);
}

/**
 * Expands bash brace alternation on plain tokens: `tar.gz{,.asc}` becomes
 * `tar.gz`, `tar.gz.asc`. Tokens stay otherwise untouched; callers handle
 * quotes and variables.
 */
export function expandBraceAlternation(token: string): string[] {
  const brace = token.match(/^(.*)\{([^{}]+)\}(.*)$/);
  // Braces without a comma are literal in bash, so `${var}` passes through.
  if (!brace || !brace[2].includes(',')) return [token];
  const [, head, body, tail] = brace;
  return body.split(',').map((alternative) => `${head}${alternative}${tail}`);
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
  const makedepends = extractArray(pkgbuildText, 'makedepends', true) ?? [];
  const depends = extractArray(pkgbuildText, 'depends', true) ?? [];
  const dependsX8664 = extractArray(pkgbuildText, 'depends_x86_64', true) ?? [];
  const dependsI686 = extractArray(pkgbuildText, 'depends_i686', true) ?? [];
  return { depends, makedepends, allDepends: [...depends, ...dependsX8664, ...dependsI686] };
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

/**
 * Classifies a PKGBUILD into package kinds. Heuristic; a package can carry
 * several kinds. Language kinds come from runtime dependencies or explicit
 * build commands — makedepends-only toolchains (a Firefox build pulls in
 * python, nodejs and rust) do not make a package that kind. `compiled` marks
 * native builds, `prebuilt`/`font`/`theme`/`firmware`/`extension` come from
 * the package name, `meta` marks dependency-only packages without source and
 * build function.
 */
export function classifyPkgbuild(pkgbuildText?: string | null): string[] {
  if (!pkgbuildText) {
    return [];
  }
  const cleanText = stripComments(pkgbuildText);
  const { depends, makedepends, allDepends } = collectAllDepends(cleanText);
  const pkgname = (pkgbuildText.match(PKGNAME_REGEX)?.[1] ?? '').replace(/^['"]+|['"]+$/g, '');
  const kinds: string[] = [];

  if (matchesKind(depends, ELECTRON_REGEX)) kinds.push('electron');
  const hasNodeTooling = matchesKind(makedepends, NODEJS_PACKAGE_REGEX) || NODEJS_BUILD_REGEX.test(cleanText);
  const isNodeRuntime = matchesKind(allDepends, NODEJS_DEP_REGEX);
  if (isNodeRuntime || (hasNodeTooling && !matchesKind(makedepends, NATIVE_TOOLCHAIN_REGEX))) kinds.push('nodejs');
  if (matchesKind(allDepends, KERNEL_MODULE_DEP_REGEX) || matchesKind(makedepends, KERNEL_MODULE_DEP_REGEX)) {
    kinds.push('kernel-module');
  }
  for (const [kind, regex] of KIND_DEP_REGEXES) {
    if (matchesKind(allDepends, regex)) kinds.push(kind);
  }
  for (const [kind, regex] of KIND_BUILD_REGEXES) {
    if (!kinds.includes(kind) && regex.test(cleanText)) kinds.push(kind);
  }
  const isNodePackage = kinds.includes('nodejs') || kinds.includes('electron');
  const compiledNative =
    (hasCompilerInList(makedepends) || hasCompilerInList(allDepends) || hasBuildSystemIndicator(cleanText)) &&
    hasBuildFunction(cleanText) &&
    !NO_STRIP_REGEX.test(cleanText);
  if (!isNodePackage && compiledNative) kinds.push('compiled');
  if (FONT_NAME_REGEX.test(pkgname)) kinds.push('font');
  if (THEME_NAME_REGEX.test(pkgname)) kinds.push('theme');
  if (EXTENSION_NAME_REGEX.test(pkgname)) kinds.push('extension');
  if (FIRMWARE_NAME_REGEX.test(pkgname)) kinds.push('firmware');
  if (PREBUILT_NAME_REGEX.test(pkgname)) kinds.push('prebuilt');
  if (kinds.length === 0 && matchesKind(allDepends, SHELL_DEPENDS_REGEX)) kinds.push('shell');
  if (kinds.length === 0 && !META_PKGBUILD_REGEX.test(cleanText) && !hasBuildFunction(cleanText)) {
    kinds.push('meta');
  }

  return kinds;
}

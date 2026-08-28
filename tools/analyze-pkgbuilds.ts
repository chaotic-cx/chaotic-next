import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { isSourceCompiledPackage } from '../backend/src/repo-manager/pkgbuild-classifier';

const PKGBUILDS_TEST_DIR = join(import.meta.dirname, '../../../pkgbuilds-test');

function getAllPkgbuildDirs(): string[] {
  try {
    return readdirSync(PKGBUILDS_TEST_DIR, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
  } catch {
    return [];
  }
}

function getPkgbuildContent(pkgname: string): string | null {
  try {
    const pkgbuildPath = join(PKGBUILDS_TEST_DIR, pkgname, 'PKGBUILD');
    return readFileSync(pkgbuildPath, 'utf-8');
  } catch {
    return null;
  }
}

interface PackageAnalysis {
  pkgname: string;
  isSourceCompiled: boolean;
  hasNodejs: boolean;
  hasCompiler: boolean;
  hasBuildFunction: boolean;
  hasStripOption: boolean;
  compilerTools: string[];
  buildSystem: string;
  classification: string;
}

function analyzePkgbuild(pkgname: string, pkgbuildContent: string): PackageAnalysis {
  const nodejsRegex = /\bnodejs\b|\bnpm\b|\byarn\b|\bpnpm\b|\belectron/i;
  const compilerRegex =
    /cmake|ninja|meson|gcc|g\+\+|clang|clang\+\+|cargo|rustc|go|ghc|bison|flex|rust|java|gradle|mvn|make|autoconf|automake|qmake|setuptools|python|perl/gi;
  const buildFunctionRegex = /(?:^|\n)\s*build\s*\(\s*\)/m;
  const stripOptionRegex = /options=\([^)]*!strip[^)]*\)/m;

  const hasNodejs = nodejsRegex.test(pkgbuildContent);
  const hasCompiler = compilerRegex.test(pkgbuildContent);
  const hasBuildFunction = buildFunctionRegex.test(pkgbuildContent);
  const hasStripOption = stripOptionRegex.test(pkgbuildContent);

  const compilerMatches = pkgbuildContent.match(compilerRegex) || [];
  const compilerTools = [...new Set(compilerMatches)];

  let buildSystem = 'unknown';
  if (/cmake/.test(pkgbuildContent)) buildSystem = 'cmake';
  else if (/meson/.test(pkgbuildContent)) buildSystem = 'meson';
  else if (/autoreconf|configure/.test(pkgbuildContent)) buildSystem = 'autotools';
  else if (/gradlew|gradle/.test(pkgbuildContent)) buildSystem = 'gradle';
  else if (/cargo|rust/.test(pkgbuildContent)) buildSystem = 'cargo';
  else if (/qmake/.test(pkgbuildContent)) buildSystem = 'qmake';
  else if (/\bmake\b/.test(pkgbuildContent)) buildSystem = 'make';

  const isSourceCompiled = isSourceCompiledPackage(pkgbuildContent);

  let classification: string;
  if (hasNodejs) classification = 'electron/nodejs wrapper (not source compiled)';
  else if (hasStripOption) classification = 'binary package (!strip option)';
  else if (isSourceCompiled) classification = 'source compiled';
  else if (hasBuildFunction) classification = 'has build() but not detected as source compiled';
  else if (hasCompiler) classification = 'has compiler tools but no build() function';
  else classification = 'no compilation detected';

  return {
    pkgname,
    isSourceCompiled,
    hasNodejs,
    hasCompiler,
    hasBuildFunction,
    hasStripOption,
    compilerTools,
    buildSystem,
    classification,
  };
}

function categorizePackages(analyses: PackageAnalysis[]) {
  const sourceCompiled = analyses.filter((p) => p.isSourceCompiled);
  const notSourceCompiled = analyses.filter((p) => !p.isSourceCompiled);

  const electronWrappers = analyses.filter((p) => p.hasNodejs);
  const binaryPackages = analyses.filter((p) => p.hasStripOption);
  const hasBuildButNotDetected = analyses.filter(
    (p) => p.hasBuildFunction && !p.isSourceCompiled && !p.hasStripOption && !p.hasNodejs,
  );
  const hasCompilerNoBuild = analyses.filter(
    (p) => p.hasCompiler && !p.hasBuildFunction && !p.hasStripOption && !p.hasNodejs,
  );

  return {
    sourceCompiled,
    notSourceCompiled,
    electronWrappers,
    binaryPackages,
    hasBuildButNotDetected,
    hasCompilerNoBuild,
  };
}

console.log('='.repeat(80));
console.log('COMPREHENSIVE PKGBUILD ANALYSIS FOR COMPILED STATUS DETECTION');
console.log('='.repeat(80));

const pkgbuildDirs = getAllPkgbuildDirs();
console.log(`\n📦 Total packages found: ${pkgbuildDirs.length}`);

const analyses: PackageAnalysis[] = [];

console.log('\n🔍 Analyzing PKGBUILDs...');
pkgbuildDirs.forEach((pkgname) => {
  const pkgbuildContent = getPkgbuildContent(pkgname);
  if (pkgbuildContent) {
    analyses.push(analyzePkgbuild(pkgname, pkgbuildContent));
  }
});

const categories = categorizePackages(analyses);

console.log('\n📊 CLASSIFICATION RESULTS:');
console.log('-'.repeat(80));
console.log(`✅ Source Compiled: ${categories.sourceCompiled.length}`);
console.log(`❌ Not Source Compiled: ${categories.notSourceCompiled.length}`);
console.log(`🔵 Electron/Node.js Wrappers: ${categories.electronWrappers.length}`);
console.log(`🟨 Binary Packages (!strip): ${categories.binaryPackages.length}`);
console.log(`⚠️  Has build() but not detected: ${categories.hasBuildButNotDetected.length}`);
console.log(`🔧 Has compiler but no build(): ${categories.hasCompilerNoBuild.length}`);

console.log('\n📈 SOURCE COMPILED PACKAGES BY BUILD SYSTEM:');
console.log('-'.repeat(80));
const buildSystems: Record<string, PackageAnalysis[]> = {};
categories.sourceCompiled.forEach((pkg) => {
  if (!buildSystems[pkg.buildSystem]) buildSystems[pkg.buildSystem] = [];
  buildSystems[pkg.buildSystem].push(pkg);
});
Object.entries(buildSystems)
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([system, pkgs]) => {
    console.log(`${system.padEnd(15)} ${pkgs.length} packages`);
  });

console.log('\n🔵 ELECTRON/NODE.JS WRAPPERS:');
console.log('-'.repeat(80));
if (categories.electronWrappers.length > 0) {
  categories.electronWrappers.slice(0, 20).forEach((pkg) => {
    console.log(`  ${pkg.pkgname} (${pkg.buildSystem})`);
  });
  if (categories.electronWrappers.length > 20) {
    console.log(`  ... and ${categories.electronWrappers.length - 20} more`);
  }
}

console.log('\n🟨 BINARY PACKAGES (!strip option):');
console.log('-'.repeat(80));
if (categories.binaryPackages.length > 0) {
  categories.binaryPackages.slice(0, 20).forEach((pkg) => {
    console.log(`  ${pkg.pkgname} (${pkg.buildSystem})`);
  });
  if (categories.binaryPackages.length > 20) {
    console.log(`  ... and ${categories.binaryPackages.length - 20} more`);
  }
}

console.log('\n⚠️  EDGE CASES: Has build() but not detected as source compiled:');
console.log('-'.repeat(80));
if (categories.hasBuildButNotDetected.length > 0) {
  categories.hasBuildButNotDetected.forEach((pkg) => {
    console.log(`  ${pkg.pkgname}`);
    console.log(`    Build system: ${pkg.buildSystem}`);
    console.log(`    Compiler tools: ${pkg.compilerTools.join(', ') || 'none'}`);
    console.log(`    Detection issue: ${pkg.classification}`);
  });
} else {
  console.log('  None found! 🎉');
}

console.log('\n🔧 EDGE CASES: Has compiler tools but no build() function:');
console.log('-'.repeat(80));
if (categories.hasCompilerNoBuild.length > 0) {
  categories.hasCompilerNoBuild.forEach((pkg) => {
    console.log(`  ${pkg.pkgname}`);
    console.log(`    Compiler tools: ${pkg.compilerTools.join(', ') || 'none'}`);
    console.log(`    Detection: ${pkg.classification}`);
  });
} else {
  console.log('  None found! 🎉');
}

console.log('\n🔍 DETAILED ANALYSIS OF INTERESTING CASES:');
console.log('-'.repeat(80));
const interestingCases = [
  ...categories.electronWrappers.slice(0, 5),
  ...categories.binaryPackages.slice(0, 5),
  ...categories.hasBuildButNotDetected.slice(0, 5),
  ...categories.sourceCompiled.slice(0, 5),
];

interestingCases.forEach((pkg) => {
  console.log(`\n📦 ${pkg.pkgname}`);
  console.log(`   isSourceCompiled: ${pkg.isSourceCompiled}`);
  console.log(`   hasNodejs: ${pkg.hasNodejs}`);
  console.log(`   hasCompiler: ${pkg.hasCompiler}`);
  console.log(`   hasBuildFunction: ${pkg.hasBuildFunction}`);
  console.log(`   hasStripOption: ${pkg.hasStripOption}`);
  console.log(`   buildSystem: ${pkg.buildSystem}`);
  console.log(`   compilerTools: ${pkg.compilerTools.join(', ') || 'none'}`);
  console.log(`   classification: ${pkg.classification}`);
});

console.log('\n' + '='.repeat(80));
console.log('✨ ANALYSIS COMPLETE');
console.log('='.repeat(80));
console.log(`\n📈 SUMMARY:`);
console.log(`   Total packages analyzed: ${analyses.length}`);
console.log(
  `   Source compiled: ${categories.sourceCompiled.length} (${((categories.sourceCompiled.length / analyses.length) * 100).toFixed(1)}%)`,
);
console.log(
  `   Electron/Node.js wrappers: ${categories.electronWrappers.length} (${((categories.electronWrappers.length / analyses.length) * 100).toFixed(1)}%)`,
);
console.log(
  `   Binary packages: ${categories.binaryPackages.length} (${((categories.binaryPackages.length / analyses.length) * 100).toFixed(1)}%)`,
);
console.log(
  `   Edge cases (build not detected): ${categories.hasBuildButNotDetected.length} (${((categories.hasBuildButNotDetected.length / analyses.length) * 100).toFixed(1)}%)`,
);
console.log(
  `   Edge cases (no build function): ${categories.hasCompilerNoBuild.length} (${((categories.hasCompilerNoBuild.length / analyses.length) * 100).toFixed(1)}%)`,
);

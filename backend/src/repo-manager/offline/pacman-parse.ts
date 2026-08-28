import { type ParsedPackage, type RepoWorkDir } from '../../interfaces/repo-manager';
import { parsePkgrel } from '@chaotic-next/shared-lib';
import { exec } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execP = promisify(exec);

/**
 * DB-free pacman database parsing shared by the running backend and the
 * offline indexer. Everything here only touches the filesystem: extract the
 * compressed `.files`/`.db` archives and read the `desc`/`files` payloads
 * they contain. No NestJS or TypeORM imports so the offline indexer can be
 * bundled standalone.
 */

const listField = (tag: string): RegExp => new RegExp(`(?<=%${tag}%\\n)[\\s\\S]*?(?=\\n{2})`);
const CHECKDEPENDS_RE = listField('CHECKDEPENDS');
const CONFLICTS_RE = listField('CONFLICTS');
const DEPENDS_RE = listField('DEPENDS');
const MAKEDEPENDS_RE = listField('MAKEDEPENDS');
const OPTDEPENDS_RE = listField('OPTDEPENDS');
const PROVIDES_RE = listField('PROVIDES');
const REPLACES_RE = listField('REPLACES');
const SONAME_RE = /\.so\.\d+(\.\d+)*$/;

function tryMatch(regExp: RegExp, source: string): string | undefined {
  const match = source.match(regExp);
  return match ? match[0] : undefined;
}

function requiredMatch(lines: string, tag: string): string {
  const match = lines.match(new RegExp(`(?<=%${tag}%\\n)\\S+`));
  if (!match) throw new Error(`Malformed pacman desc file: missing %${tag}%`);
  return match[0];
}

export function extractBaseAndVersion(lines: string): Partial<ParsedPackage> {
  const completeVersion: string = requiredMatch(lines, 'VERSION');
  const splitVersion: string[] = completeVersion.split('-');
  const base = requiredMatch(lines, 'BASE');
  const checkDepends = tryMatch(CHECKDEPENDS_RE, lines);
  const conflicts = tryMatch(CONFLICTS_RE, lines);
  const deps = tryMatch(DEPENDS_RE, lines);
  const desc = lines.match(/(?<=%DESC%\n)[\s\S]*?(?=\n{2})/);
  const license = lines.match(/(?<=%LICENSE%\n)\S+/);
  const makeDeps = tryMatch(MAKEDEPENDS_RE, lines);
  const name = requiredMatch(lines, 'NAME');
  const optDeps = tryMatch(OPTDEPENDS_RE, lines);
  const packager = lines.match(/(?<=%PACKAGER%\n)[\s\S]*?(?=\n{2})/);
  const { pkgrel, bump } = parsePkgrel(splitVersion[splitVersion.length - 1]);
  const provides = tryMatch(PROVIDES_RE, lines);
  const replaces = tryMatch(REPLACES_RE, lines);
  const url = lines.match(/(?<=%URL%\n)\S+/);
  const version = splitVersion[0];

  return {
    base,
    version,
    pkgrel,
    bump,
    name,
    metaData: {
      buildDate: requiredMatch(lines, 'BUILDDATE'),
      checkDepends: checkDepends ? checkDepends.split('\n') : undefined,
      conflicts: conflicts ? conflicts.split('\n') : undefined,
      deps: deps ? deps.split('\n') : undefined,
      license: license ? license[0] : undefined,
      filename: requiredMatch(lines, 'FILENAME'),
      makeDeps: makeDeps ? makeDeps.split('\n') : undefined,
      optDeps: optDeps ? optDeps.split('\n') : undefined,
      packager: packager ? packager[0] : undefined,
      desc: desc ? desc[0] : undefined,
      provides: provides ? provides.split('\n') : undefined,
      replaces: replaces ? replaces.split('\n') : undefined,
      url: url ? url[0] : undefined,
    },
  };
}

export async function parsePackageDesc(descFile: string): Promise<Partial<ParsedPackage>> {
  try {
    const fileStats = await stat(descFile);
    if (!fileStats.isFile()) return {};
    const lines = await readFile(descFile, 'utf-8');
    return extractBaseAndVersion(lines);
  } catch {
    return {};
  }
}

export async function parsePackageFiles(filesFile: string): Promise<string[]> {
  try {
    const fileStats = await stat(filesFile);
    if (!fileStats.isFile()) return [];
    const fileData = await readFile(filesFile, 'utf-8');
    return [
      ...new Set(
        fileData
          .split('\n')
          .map((line) => line.trim().split('/').pop() ?? '')
          .filter((line) => SONAME_RE.test(line)),
      ),
    ];
  } catch {
    return [];
  }
}

export async function listPackageDirs(srcPath: string): Promise<string[]> {
  try {
    const pathContent = await readdir(srcPath);
    const results = await Promise.all(
      pathContent.map(async (file) => {
        try {
          const dir = await stat(join(srcPath, file));
          return (dir.isDirectory() && !file.startsWith('.')) || file === '.CI' ? file : null;
        } catch {
          return null;
        }
      }),
    );
    return results.filter((file): file is string => file !== null);
  } catch {
    return [];
  }
}

export async function extractPacmanDatabase(filesPath: string, workDir: string): Promise<void> {
  const { stderr } = await execP(`tar -xf "${filesPath}" -C "${workDir}"`);
  if (stderr) throw new Error(stderr);
}

export async function parsePacmanDatabases(workDirs: RepoWorkDir[]): Promise<ParsedPackage[]> {
  const parsed: ParsedPackage[] = [];
  for (const dir of workDirs) {
    if (!dir || !dir.path) continue;
    const allPkgDirs: string[] = await listPackageDirs(dir.path);
    const currentPathRegex = new RegExp(`/${dir.path}/`);
    for (const pkgDir of allPkgDirs) {
      const pkg = pkgDir.replace(currentPathRegex, '');
      const descFile = join(dir.path, pkg, 'desc');
      const filesFile = join(dir.path, pkg, 'files');
      try {
        const currentPackageVersion: Partial<ParsedPackage> = await parsePackageDesc(descFile);
        if (!currentPackageVersion || Object.keys(currentPackageVersion).length === 0) continue;
        if (!currentPackageVersion.metaData) {
          currentPackageVersion.metaData = { buildDate: '', filename: '' };
        }
        currentPackageVersion.metaData.soNameList = await parsePackageFiles(filesFile);
        currentPackageVersion.repoName = dir.name;
        parsed.push(currentPackageVersion as ParsedPackage);
      } catch {
        // skip unreadable package payloads
      }
    }
  }
  return parsed;
}

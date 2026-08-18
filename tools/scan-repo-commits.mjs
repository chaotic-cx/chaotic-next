#!/usr/bin/env node
/**
 * Scans every commit of a repository with the diff-scan rule catalog and dumps a
 * per-commit report. Intended for auditing repository history, e.g. finding commits
 * that would have triggered malware verdicts.
 *
 * Two modes, picked by the target argument:
 *   - GitLab API: pass a project path (e.g. "chaotic-aur/pkgbuilds")
 *   - Offline git: pass a path to a local clone (e.g. "../pkgbuilds" or "pkgbuilds-test")
 *
 * Usage:
 *   node tools/scan-repo-commits.mjs <gitlab-project-path | local-repo-dir> [options]
 *
 * Options:
 *   --limit N        stop after N commits (default: all)
 *   --concurrency N  parallel diff fetches (default: 3, offline: 4)
 *   --delay MS       pause between requests per worker (default: 300, offline: 0)
 *   --out FILE       report destination (default: /tmp/repo-commit-report.jsonl)
 *   --ref NAME       branch/tag to walk (GitLab mode only)
 *
 * The report is JSONL, one line per commit (clean commits included):
 *   { sha, authoredDate, authorName, title, findings, verdict }
 * Already-reported SHAs are skipped on re-run, so the tool can be interrupted freely.
 */

import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);
const targetArg = args[0];
if (!targetArg || targetArg.startsWith('--')) {
  console.error(
    'Usage: node tools/scan-repo-commits.mjs <gitlab-project-path | local-repo-dir> [--limit N] [--out FILE]',
  );
  process.exit(1);
}
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const LOCAL_REPO =
  existsSync(resolve(targetArg)) && statSync(resolve(targetArg)).isDirectory() ? resolve(targetArg) : null;
const PROJECT_PATH = LOCAL_REPO ? null : targetArg;
const LIMIT = Number(option('--limit', '0'));
const CONCURRENCY = Number(option('--concurrency', LOCAL_REPO ? '4' : '3'));
const DELAY_MS = Number(option('--delay', LOCAL_REPO ? '0' : '300'));
const OUT_FILE = option('--out', '/tmp/repo-commit-report.jsonl');
const REF = option('--ref', undefined);

const BASE = PROJECT_PATH ? `https://gitlab.com/api/v4/projects/${encodeURIComponent(PROJECT_PATH)}` : null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_BUFFER = 512 * 1024 * 1024;

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (attempt < 6 && (res.status === 429 || res.status >= 500)) {
      console.warn(`${res.status} on ${url}, retrying in ${3 * attempt}s`);
      await sleep(3000 * attempt);
      continue;
    }
    throw new Error(`${res.status} ${url}`);
  }
}

function git(repo, ...gitArgs) {
  return execFileAsync('git', ['-C', repo, ...gitArgs], { maxBuffer: MAX_BUFFER });
}

async function bundleScanner() {
  const outfile = '/tmp/diff-scan-bundle.cjs';
  const entry = join(dirname(fileURLToPath(import.meta.url)), '..', 'backend/src/diff-scan/diff-scan.service.ts');
  const rulesDir = join(dirname(entry), 'rules');
  const sourceFiles = [entry, ...readdirSync(rulesDir).map((file) => join(rulesDir, file))];
  const newestSource = Math.max(...sourceFiles.map((file) => statSync(file).mtimeMs));
  if (!existsSync(outfile) || statSync(outfile).mtimeMs < newestSource) {
    await build({
      entryPoints: [entry],
      bundle: true,
      format: 'cjs',
      platform: 'node',
      outfile,
      logLevel: 'silent',
    });
  }
  const require = createRequire(import.meta.url);
  return require(outfile);
}

async function listCommits() {
  if (LOCAL_REPO) {
    const format = '%H%x1f%aI%x1f%an%x1f%s';
    const { stdout } = await git(LOCAL_REPO, 'log', `--format=${format}`, REF ?? 'HEAD');
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id, authoredDate, authorName, title] = line.split('\x1f');
        return { id, short_id: id.slice(0, 8), authoredDate, authorName, title, created_at: authoredDate };
      });
  }

  const commits = [];
  for (let page = 1; ; page++) {
    const batch = await getJson(`${BASE}/repository/commits?per_page=100&page=${page}${REF ? `&ref_name=${REF}` : ''}`);
    if (batch.length === 0) break;
    commits.push(...batch);
    console.log(`listed ${commits.length} commits (page ${page})`);
    if (LIMIT > 0 && commits.length >= LIMIT) break;
  }
  return commits;
}

function parseGitShow(output) {
  const sections = output.split(/^diff --git /m).slice(1);
  const entries = [];

  for (const section of sections) {
    const lines = section.split('\n');
    const header = lines[0] ?? '';
    const headerMatch = header.match(/^a\/(.*) b\/(.*)$/);
    let oldPath = headerMatch?.[1] ?? header;
    let newPath = headerMatch?.[2] ?? header;

    let newFile = false;
    let deletedFile = false;
    let renamedFile = false;
    let diffStart = 1;

    for (let index = 1; index < lines.length; index++) {
      const line = lines[index] ?? '';
      if (line.startsWith('new file mode ')) newFile = true;
      else if (line.startsWith('deleted file mode ')) deletedFile = true;
      else if (line.startsWith('rename from ')) {
        renamedFile = true;
        oldPath = line.slice('rename from '.length);
      } else if (line.startsWith('rename to ')) newPath = line.slice('rename to '.length);
      else if (line.startsWith('--- a/')) oldPath = line.slice('--- a/'.length);
      else if (line.startsWith('--- /dev/null')) oldPath = newPath;
      else if (line.startsWith('+++ b/')) newPath = line.slice('+++ b/'.length);
      else if (line.startsWith('+++ /dev/null')) newPath = oldPath;
      if (line.startsWith('@@') || line.startsWith('-') || line.startsWith('+') || line.startsWith(' ')) {
        diffStart = Math.min(diffStart, index);
        if (line.startsWith('@@')) break;
      }
    }

    entries.push({
      old_path: oldPath,
      new_path: newPath,
      a_mode: '100644',
      b_mode: '100644',
      new_file: newFile,
      renamed_file: renamedFile,
      deleted_file: deletedFile,
      diff: lines.slice(diffStart).join('\n'),
    });
  }
  return entries;
}

function isAurPackagePath(path) {
  if (/(^|\/)\.CI\//.test(path)) return false;
  if (/^\.(ci|github|gitlab|tools)\//.test(path)) return false;
  if (/^\.(gitlab-ci.*\.yml|cz\.yaml|editorconfig|gitignore|envrc)$/.test(path)) return false;
  return true;
}

async function fetchCommitDiff(commit) {
  if (LOCAL_REPO) {
    const { stdout } = await git(LOCAL_REPO, 'show', '--format=', '--unified=3', '--first-parent', commit.id);
    return parseGitShow(stdout).filter((entry) => isAurPackagePath(entry.new_path));
  }
  return getJson(`${BASE}/repository/commits/${commit.id}/diff`);
}

async function main() {
  const { DiffScanService } = await bundleScanner();
  const scanner = new DiffScanService();
  console.log(LOCAL_REPO ? `offline mode: ${LOCAL_REPO}` : `GitLab API mode: ${PROJECT_PATH}`);

  const targets = await listCommits();
  const commits = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const done = new Set(
    existsSync(OUT_FILE)
      ? readFileSync(OUT_FILE, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line).sha)
      : [],
  );
  const queue = commits.filter((commit) => !done.has(commit.id));
  console.log(`scanning ${queue.length} commits (${done.size} already reported), report: ${OUT_FILE}`);

  let processed = 0;
  let flagged = 0;
  const ruleMatches = new Map();
  const verdictCounts = new Map();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const commit = queue.shift();
        if (!commit) return;

        let findings = [];
        try {
          findings = scanner.scanDiffs(await fetchCommitDiff(commit));
        } catch (err) {
          console.warn(`diff failed for ${commit.short_id} (${commit.title}): ${err.message}`);
        }

        const verdict = scanner.autoFlagVerdict(findings);
        appendFileSync(
          OUT_FILE,
          `${JSON.stringify({
            sha: commit.id,
            authoredDate: commit.authoredDate ?? commit.authored_date,
            authorName: commit.authorName ?? commit.author_name,
            title: commit.title,
            findings,
            verdict,
          })}\n`,
        );
        if (findings.length > 0) {
          flagged++;
          if (verdict) verdictCounts.set(verdict.label, (verdictCounts.get(verdict.label) ?? 0) + 1);
          console.log(
            `${(commit.created_at ?? '').slice(0, 10)} ${commit.short_id} ${commit.title}${verdict ? ` => ${verdict.label.toUpperCase()} (${verdict.score})` : ''}`,
          );
          for (const finding of findings) {
            const bucket = ruleMatches.get(finding.ruleId) ?? [];
            bucket.push(`${finding.file}${finding.line ?? ''}: ${finding.match}`);
            ruleMatches.set(finding.ruleId, bucket);
            console.log(
              `  ${finding.severity.padEnd(8)} ${finding.ruleId.padEnd(22)} ${finding.file}${finding.line ?? ''}`,
            );
          }
        }

        if (DELAY_MS > 0) await sleep(DELAY_MS);
        processed++;
        if (processed % 250 === 0) console.log(`${processed}/${queue.length} scanned...`);
      }
    }),
  );

  console.log(`\ndone: ${processed} scanned, ${flagged} with findings`);
  console.log('verdicts:', Object.fromEntries(verdictCounts));
  console.log('offending matches per rule:');
  for (const [ruleId, matches] of [...ruleMatches.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${ruleId} (${matches.length}):`);
    for (const match of matches) console.log(`  ${match}`);
  }
}

await main();

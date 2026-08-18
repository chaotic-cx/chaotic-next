import { mkdir, readFile, writeFile } from 'node:fs/promises';

function mergeCounters(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a + b;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.map((x, i) => (typeof x === 'number' && typeof b[i] === 'number' ? x + b[i] : x || b[i]));
  }
  return a ?? b;
}

function mergeFileCoverage(base, incoming) {
  if (!base) return structuredClone(incoming);
  const merged = {
    statementMap: { ...base.statementMap, ...incoming.statementMap },
    fnMap: { ...base.fnMap, ...incoming.fnMap },
    branchMap: { ...base.branchMap, ...incoming.branchMap },
    s: {},
    f: {},
    b: {},
  };
  const sKeys = new Set([...Object.keys(base.s), ...Object.keys(incoming.s)]);
  for (const k of sKeys) merged.s[k] = mergeCounters(base.s?.[k], incoming.s?.[k]);
  const fKeys = new Set([...Object.keys(base.f), ...Object.keys(incoming.f)]);
  for (const k of fKeys) merged.f[k] = mergeCounters(base.f?.[k], incoming.f?.[k]);
  const bKeys = new Set([...Object.keys(base.b), ...Object.keys(incoming.b)]);
  for (const k of bKeys) merged.b[k] = mergeCounters(base.b?.[k], incoming.b?.[k]);
  return merged;
}

function buildSummary(final) {
  const total = () => ({ total: 0, covered: 0, skipped: 0, pct: 0 });
  const summary = {
    total: { lines: total(), statements: total(), functions: total(), branches: total(), branchesTrue: total() },
  };

  for (const file of Object.keys(final)) {
    const f = final[file];
    const fileSummary = {
      lines: total(),
      statements: total(),
      functions: total(),
      branches: total(),
      branchesTrue: total(),
    };

    const stmtKeys = Object.keys(f.statementMap);
    const fnKeys = Object.keys(f.fnMap);
    const branchKeys = Object.keys(f.branchMap);

    fileSummary.statements.total = stmtKeys.length;
    fileSummary.statements.covered = stmtKeys.filter((k) => f.s?.[k]).length;

    fileSummary.functions.total = fnKeys.length;
    fileSummary.functions.covered = fnKeys.filter((k) => f.f?.[k]).length;

    const lineSet = new Set();
    for (const k of stmtKeys) {
      const line = f.statementMap[k]?.start?.line;
      if (typeof line === 'number') lineSet.add(line);
    }
    fileSummary.lines.total = lineSet.size;
    const coveredLines = new Set();
    for (const k of stmtKeys) {
      const line = f.statementMap[k]?.start?.line;
      if (typeof line === 'number' && f.s?.[k] > 0) coveredLines.add(line);
    }
    fileSummary.lines.covered = coveredLines.size;

    for (const k of branchKeys) {
      const counts = f.b?.[k];
      const paths = f.branchMap[k]?.locations?.length ?? 1;
      fileSummary.branches.total += paths;
      if (Array.isArray(counts)) fileSummary.branches.covered += counts.filter((c) => c > 0).length;
      else if (counts > 0) fileSummary.branches.covered += paths;
    }

    for (const metric of ['lines', 'statements', 'functions', 'branches']) {
      const m = fileSummary[metric];
      m.pct = m.total > 0 ? Number(((m.covered / m.total) * 100).toFixed(2)) : 100;
      for (const sub of Object.keys(summary.total)) {
        if (sub === metric) continue;
      }
      summary.total[metric].total += m.total;
      summary.total[metric].covered += m.covered;
    }

    summary[file] = fileSummary;
  }

  for (const metric of ['lines', 'statements', 'functions', 'branches', 'branchesTrue']) {
    const m = summary.total[metric];
    m.pct = m.total > 0 ? Number(((m.covered / m.total) * 100).toFixed(2)) : 100;
  }
  return summary;
}

function normalizeFilePath(filePath) {
  let normalized = filePath.replace(/^(?:\.\.\/)+backend\//, 'backend/').replace(/^\/.*\/backend\//, 'backend/');
  if (normalized.startsWith('src/')) {
    normalized = `backend/${normalized}`;
  }
  return normalized;
}

async function main() {
  const [outPath, ...inputs] = process.argv.slice(2);
  if (!outPath || inputs.length === 0) {
    console.error('Usage: merge-coverage.mjs <out.json> <input1.json> [<input2.json> ...]');
    process.exit(1);
  }

  const merged = {};
  for (const input of inputs) {
    const data = JSON.parse(await readFile(input, 'utf8'));
    for (const file of Object.keys(data)) {
      const normalizedKey = normalizeFilePath(file);
      const fileData = data[file];
      if (fileData) {
        fileData.path = normalizedKey;
      }
      merged[normalizedKey] = mergeFileCoverage(merged[normalizedKey], fileData);
    }
  }

  const dir = outPath.replace(/\/[^/]+$/, '');
  await mkdir(dir, { recursive: true });
  await writeFile(outPath, JSON.stringify(merged, null, 2));
  await writeFile(`${dir}/coverage-summary.json`, JSON.stringify(buildSummary(merged), null, 2));

  const total = buildSummary(merged).total;
  console.log(
    `Merged ${inputs.length} reports -> ${outPath}\n` +
      `  lines: ${total.lines.pct}% (${total.lines.covered}/${total.lines.total})\n` +
      `  stmts: ${total.statements.pct}%\n` +
      `  funcs: ${total.functions.pct}%\n` +
      `  bran : ${total.branches.pct}%`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

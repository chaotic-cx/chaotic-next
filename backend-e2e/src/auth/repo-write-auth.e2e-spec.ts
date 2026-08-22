import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp, type E2eResponse } from '../test/e2e-app';
import { CHAOTIC_AUR_REPO, GARUDA_REPO } from '../test/fixtures';

const GROUPS_HEADER = 'x-test-user-groups';
const CHAOTIC_AUR_ONLY = CHAOTIC_AUR_REPO.name;

const GARUDA_GROUP = 'garuda-linux';
const BOTH_GROUPS = `${CHAOTIC_AUR_ONLY},${GARUDA_GROUP}`;

async function injectWithGroups<T = unknown>(
  e2e: E2eApp,
  groups: string | undefined,
  method: 'POST',
  url: string,
  payload: unknown,
): Promise<E2eResponse<T>> {
  return e2e.inject<T>({
    method,
    url,
    payload,
    headers: groups === undefined ? {} : { [GROUPS_HEADER]: groups },
  });
}

describe('Repo write authorization via GitLab group membership (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  beforeEach(async () => {
    await e2e.resetTables();
  });

  afterAll(async () => {
    await e2e.close();
  });

  describe('POST /gitlab/bump-packages (repo-derived group)', () => {
    const url = '/gitlab/bump-packages';

    it('denies a user without any group membership', async () => {
      const res = await injectWithGroups(e2e, undefined, 'POST', url, {
        packages: ['linux'],
        repo: CHAOTIC_AUR_ONLY,
      });
      expect(res.statusCode).toBe(403);
    });

    it('denies a user who is only in the garuda group', async () => {
      const res = await injectWithGroups<{ message?: string }>(e2e, GARUDA_GROUP, 'POST', url, {
        packages: ['linux'],
        repo: CHAOTIC_AUR_ONLY,
      });
      expect(res.statusCode).toBe(403);
      const body = await res.json();
      expect(body.message).toBe("This action requires GitLab group membership in 'chaotic-aur'.");
    });

    it('admits a chaotic-aur member and fails later on the missing repo (not 403)', async () => {
      const res = await injectWithGroups(e2e, CHAOTIC_AUR_ONLY, 'POST', url, {
        packages: ['linux'],
        repo: CHAOTIC_AUR_ONLY,
      });
      expect(res.statusCode).not.toBe(403);
    });

    it('denies an unmapped repository even for members of both groups', async () => {
      const res = await injectWithGroups(e2e, BOTH_GROUPS, 'POST', url, {
        packages: ['linux'],
        repo: 'unknown-repo',
      });
      expect(res.statusCode).toBe(403);
    });

    it('denies when no repository is specified', async () => {
      const res = await injectWithGroups(e2e, BOTH_GROUPS, 'POST', url, { packages: ['linux'] });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /gitlab/add-packages (repo-derived group)', () => {
    const url = '/gitlab/add-packages';

    it('denies a chaotic-aur-only member targeting the garuda repo', async () => {
      const res = await injectWithGroups(e2e, CHAOTIC_AUR_ONLY, 'POST', url, {
        packages: [{ pkgname: 'some-pkg' }],
        repo: GARUDA_REPO.name,
        request_origin: 'e2e-test',
      });
      expect(res.statusCode).toBe(403);
    });

    it('admits a garuda member targeting the garuda repo', async () => {
      const res = await injectWithGroups(e2e, GARUDA_GROUP, 'POST', url, {
        packages: [{ pkgname: 'some-pkg' }],
        repo: GARUDA_REPO.name,
        request_origin: 'e2e-test',
      });
      expect(res.statusCode).not.toBe(403);
    });

    it('denies a garuda member targeting the chaotic-aur repo', async () => {
      const res = await injectWithGroups(e2e, GARUDA_GROUP, 'POST', url, {
        packages: [{ pkgname: 'some-pkg' }],
        repo: CHAOTIC_AUR_ONLY,
        request_origin: 'e2e-test',
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /gitlab/drop-packages (repo-derived group)', () => {
    const url = '/gitlab/drop-packages';

    it('denies a user without the matching group', async () => {
      const res = await injectWithGroups(e2e, GARUDA_GROUP, 'POST', url, {
        packages: ['some-pkg'],
        repo: CHAOTIC_AUR_ONLY,
      });
      expect(res.statusCode).toBe(403);
    });

    it('admits a matching-group member', async () => {
      const res = await injectWithGroups(e2e, CHAOTIC_AUR_ONLY, 'POST', url, {
        packages: ['some-pkg'],
        repo: CHAOTIC_AUR_ONLY,
      });
      expect(res.statusCode).not.toBe(403);
    });
  });

  describe('POST /gitlab endpoints mutating chaotic-aur implicitly', () => {
    it.each([
      ['/gitlab/approve', { iid: 101, sha: '4a70b438f76d5c8f6f739ea110f8c071efe8067f' }],
      ['/gitlab/flag', { iid: 101, label: 'hold' }],
      ['/gitlab/mr-scan', {}],
      ['/gitlab/run-schedule', { scheduleId: 12 }],
      ['/gitlab/trigger', { operation: 'bump-packages', packages: 'linux' }],
    ] as const)('denies a garuda-only member calling POST %s', async (url, payload) => {
      const res = await injectWithGroups(e2e, GARUDA_GROUP, 'POST', url, payload);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /repo/broken/bump (group derived from each package’s repo)', () => {
    const url = '/repo/broken/bump';

    it('denies bumping a chaotic-aur package without the chaotic-aur group', async () => {
      const repo = await e2e.seedRepo({ name: CHAOTIC_AUR_REPO.name });
      const pkg = await e2e.seedPackage({ pkgname: 'broken-chaotic-pkg', isActive: true, repo });
      expect(pkg.repo.name).toBe(CHAOTIC_AUR_ONLY);

      const res = await injectWithGroups(e2e, GARUDA_GROUP, 'POST', url, { pkgnames: ['broken-chaotic-pkg'] });
      expect(res.statusCode).toBe(403);
    });

    it('passes authorization for a chaotic-aur package with the chaotic-aur group', async () => {
      const repo = await e2e.seedRepo({ name: CHAOTIC_AUR_REPO.name });
      const pkg = await e2e.seedPackage({ pkgname: 'broken-chaotic-pkg', isActive: true, repo });
      expect(pkg.repo.name).toBe(CHAOTIC_AUR_ONLY);

      const res = await injectWithGroups(e2e, CHAOTIC_AUR_ONLY, 'POST', url, { pkgnames: ['broken-chaotic-pkg'] });
      expect(res.statusCode).not.toBe(403);
    });

    it('denies bumping a garuda package with only the chaotic-aur group', async () => {
      const repo = await e2e.seedRepo({ name: GARUDA_REPO.name });
      const pkg = await e2e.seedPackage({ pkgname: 'broken-garuda-pkg', isActive: true, repo });
      expect(pkg.repo.name).toBe(GARUDA_REPO.name);

      const res = await injectWithGroups(e2e, CHAOTIC_AUR_ONLY, 'POST', url, { pkgnames: ['broken-garuda-pkg'] });
      expect(res.statusCode).toBe(403);
    });

    it('admits bumping a garuda package for a garuda member', async () => {
      const repo = await e2e.seedRepo({ name: GARUDA_REPO.name });
      const pkg = await e2e.seedPackage({ pkgname: 'broken-garuda-pkg', isActive: true, repo });
      expect(pkg.repo.name).toBe(GARUDA_REPO.name);

      const res = await injectWithGroups(e2e, GARUDA_GROUP, 'POST', url, { pkgnames: ['broken-garuda-pkg'] });
      expect(res.statusCode).not.toBe(403);
    });
  });
});

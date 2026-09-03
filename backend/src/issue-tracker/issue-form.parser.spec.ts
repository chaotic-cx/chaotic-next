import { describe, expect, it } from 'vitest';
import { parsePackageRequest } from './issue-form.parser';

const REQUEST_BODY = `### Package

https://aur.archlinux.org/pkgbase/foo-app

### Purpose

A nice application.

### License

GPL-3.0-or-later

### Submission checklist

- [X] The package is not banned.
`;

const REBUILD_BODY = `### Packages

https://aur.archlinux.org/pkgbase/foo-app
https://aur.archlinux.org/pkgbase/bar-lib

### Description

Outdated: 1.0 vs 2.0.
`;

describe('parsePackageRequest', () => {
  it('parses a valid new package request', () => {
    const result = parsePackageRequest('[Request] foo-app', REQUEST_BODY);
    expect(result).toEqual({
      ok: true,
      kind: 'request',
      request: {
        pkgbases: ['foo-app'],
        purpose: 'A nice application.',
        license: 'GPL-3.0-or-later',
      },
    });
  });

  it('parses a valid rebuild request with several pkgbases', () => {
    const result = parsePackageRequest('[Rebuild] foo-app', REBUILD_BODY);
    expect(result).toEqual({
      ok: true,
      kind: 'rebuild',
      request: {
        pkgbases: ['foo-app', 'bar-lib'],
        description: 'Outdated: 1.0 vs 2.0.',
        custom: false,
      },
    });
  });

  it('tolerates a non-AUR source link in a rebuild and falls back to the title pkgbase', () => {
    const body =
      '### Packages\n\nhttps://github.com/Frogging-Family/mesa-git\n\n### Description\n\nMore than one week old.\n';
    const result = parsePackageRequest('[Rebuild] mesa-tkg-git', body);
    expect(result).toEqual({
      ok: true,
      kind: 'rebuild',
      request: { pkgbases: ['mesa-tkg-git'], description: 'More than one week old.', custom: false },
    });
  });

  it('detects a checked custom-package box', () => {
    const body =
      '### Packages\n\nhttps://github.com/Frogging-Family/mesa-git\n\n### Description\n\nBroken on new kernel.\n\n- [x] This is a custom package that is not available on the AUR.\n';
    const result = parsePackageRequest('[Rebuild] mesa-tkg-git', body);
    expect(result).toMatchObject({ ok: true, request: { custom: true } });
  });

  it('rejects a malformed title', () => {
    const result = parsePackageRequest('please add foo', REQUEST_BODY);
    expect(result).toEqual({
      ok: false,
      failures: [
        {
          section: 'Title',
          problem: 'The title must be `[Request] package_name`, `[Rebuild] package_name` or `[Issue] package_name`.',
        },
      ],
    });
  });

  it('reports a bad AUR link and an empty section', () => {
    const body = REQUEST_BODY.replace('https://aur.archlinux.org/pkgbase/foo-app', 'https://example.com/foo').replace(
      'GPL-3.0-or-later',
      '_No response_',
    );
    const result = parsePackageRequest('[Request] foo-app', body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.map((failure) => failure.section)).toEqual(['Package', 'Package', 'License']);
    }
  });

  it('accepts a bare pkgbase name as the Package section', () => {
    const body = REQUEST_BODY.replace('https://aur.archlinux.org/pkgbase/foo-app', 'foo-app');
    const result = parsePackageRequest('[Request] foo-app', body);
    expect(result).toMatchObject({ ok: true, request: { pkgbases: ['foo-app'] } });
  });

  it('accepts a package URL as well as a pkgbase URL', () => {
    const body = REQUEST_BODY.replace(
      'https://aur.archlinux.org/pkgbase/foo-app',
      'aur.archlinux.org/packages/foo-app',
    );
    const result = parsePackageRequest('[Request] foo-app', body);
    expect(result).toMatchObject({ ok: true, request: { pkgbases: ['foo-app'] } });
  });

  it('accepts a request without a submission checklist section', () => {
    const body = REQUEST_BODY.replace(/\n### Submission checklist[\s\S]*$/, '\n');
    const result = parsePackageRequest('[Request] foo-app', body);
    expect(result).toMatchObject({ ok: true, request: { pkgbases: ['foo-app'] } });
  });

  it('accepts a long multi-paragraph purpose', () => {
    const body = REQUEST_BODY.replace(
      'A nice application.',
      'Overskride is a modern GTK4 manager.\n\nIt is useful on Wayland desktops.\n\nCompared to others it is good.',
    );
    const result = parsePackageRequest('[Request] foo-app', body);
    expect(result).toMatchObject({ ok: true, request: { pkgbases: ['foo-app'] } });
  });

  it('rejects unconfirmed submission checklist items', () => {
    const body = REQUEST_BODY.replace('[X] The package is not banned.', '[ ] The package is not banned.');
    const result = parsePackageRequest('[Request] foo-app', body);
    expect(result).toMatchObject({
      ok: false,
      failures: [{ section: 'Submission checklist', problem: 'Some checklist items are not confirmed.' }],
    });
  });

  it('accepts split-package member links in one request', () => {
    const body = REQUEST_BODY.replace(
      'https://aur.archlinux.org/pkgbase/foo-app',
      'https://aur.archlinux.org/packages/umbriel-git\nhttps://aur.archlinux.org/packages/xdg-desktop-portal-umbriel-git',
    );
    const result = parsePackageRequest('[Request] umbriel-git', body);
    expect(result).toMatchObject({
      ok: true,
      request: { pkgbases: ['umbriel-git', 'xdg-desktop-portal-umbriel-git'] },
    });
  });

  it('accepts common SPDX license spellings', () => {
    for (const license of ['GPL-3.0-or-later', 'MIT', 'Apache 2.0', 'GPLv3', 'BSD-3-Clause']) {
      const body = REQUEST_BODY.replace('GPL-3.0-or-later', license);
      expect(parsePackageRequest('[Request] foo-app', body)).toMatchObject({ ok: true });
    }
  });

  it('accepts the full AGPL license name', () => {
    const body = REQUEST_BODY.replace('GPL-3.0-or-later', 'GNU Affero General Public License v3.0');
    expect(parsePackageRequest('[Request] foo-app', body)).toMatchObject({ ok: true });
  });

  it('rejects a license that is not open source', () => {
    const body = REQUEST_BODY.replace('GPL-3.0-or-later', 'Proprietary, all rights reserved');
    const result = parsePackageRequest('[Request] foo-app', body);
    expect(result).toMatchObject({
      ok: false,
      failures: [
        {
          section: 'License',
          problem: expect.stringContaining('is not a recognized open-source license'),
        },
      ],
    });
  });

  it('rejects a rebuild with an empty description', () => {
    const result = parsePackageRequest(
      '[Rebuild] mesa-tkg-git',
      '### Packages\n\nhttps://aur.archlinux.org/pkgbase/mesa-tkg-git\n\n### Description\n\n_No response_\n',
    );
    expect(result).toMatchObject({ ok: false, failures: [{ section: 'Description' }] });
  });

  it('accepts a rebuild with confirmation checked', () => {
    const body =
      '### Packages\n\nhttps://aur.archlinux.org/pkgbase/foo-app\n\n### Description\n\nOutdated.\n\n### Confirmation\n\n- [x] I verified the AUR package itself is updated — this is a rebuild of the same pkgbase, not a packaging change.\n';
    expect(parsePackageRequest('[Rebuild] foo-app', body)).toMatchObject({ ok: true, kind: 'rebuild' });
  });

  it('rejects a rebuild when confirmation is present but unchecked', () => {
    const body =
      '### Packages\n\nhttps://aur.archlinux.org/pkgbase/foo-app\n\n### Description\n\nOutdated.\n\n### Confirmation\n\n- [ ] I verified the AUR package itself is updated — this is a rebuild of the same pkgbase, not a packaging change.\n';
    const result = parsePackageRequest('[Rebuild] foo-app', body);
    expect(result).toMatchObject({ ok: false, failures: [{ section: 'Confirmation' }] });
  });

  it('parses a valid package issue with issue type and logs', () => {
    const body =
      '### Package\n\nfoo-app\n\n### Issue type\n\nBuild failure\n\n### Issue description\n\nFails to build\n\n### Logs\n\nerror: failed\n';
    const result = parsePackageRequest('[Issue] foo-app', body);
    expect(result).toEqual({
      ok: true,
      kind: 'issue',
      request: {
        pkgbases: ['foo-app'],
        issueType: 'Build failure',
        description: 'Fails to build',
        logs: 'error: failed',
      },
    });
  });

  it('rejects a package issue without issue type', () => {
    const body =
      '### Package\n\nfoo-app\n\n### Issue type\n\n_No response_\n\n### Issue description\n\nSomething\n\n### Logs\n\nlog\n';
    const result = parsePackageRequest('[Issue] foo-app', body);
    expect(result).toMatchObject({ ok: false, failures: [{ section: 'Issue type' }] });
  });

  it('rejects a build failure issue without logs', () => {
    const body =
      '### Package\n\nfoo-app\n\n### Issue type\n\nBuild failure\n\n### Issue description\n\nFails\n\n### Logs\n\n_No response_\n';
    const result = parsePackageRequest('[Issue] foo-app', body);
    expect(result).toMatchObject({ ok: false, failures: [{ section: 'Logs' }] });
  });

  it('accepts two pkgbases in Request title via comma', () => {
    const result = parsePackageRequest('[Request] foo-app, bar-lib', REQUEST_BODY);
    expect(result).toMatchObject({ ok: true, kind: 'request' });
  });

  it('accepts two pkgbases in Request title via space', () => {
    const result = parsePackageRequest('[Request] foo-app bar-lib', REQUEST_BODY);
    expect(result).toMatchObject({ ok: true, kind: 'request' });
  });

  it('uses both title pkgbases for Rebuild when Packages section is empty', () => {
    const body = '### Packages\n\n_No response_\n\n### Description\n\nOutdated.\n';
    const result = parsePackageRequest('[Rebuild] foo-app, bar-lib', body);
    expect(result).toEqual({
      ok: true,
      kind: 'rebuild',
      request: { pkgbases: ['foo-app', 'bar-lib'], description: 'Outdated.', custom: false },
    });
  });

  it('uses both title pkgbases for Issue when Package section is empty', () => {
    const body =
      '### Package\n\n_No response_\n\n### Issue type\n\nBuild failure\n\n### Issue description\n\nFails\n\n### Logs\n\nerror: failed\n';
    const result = parsePackageRequest('[Issue] foo-app, bar-lib', body);
    expect(result).toMatchObject({ ok: true, kind: 'issue', request: { pkgbases: ['foo-app', 'bar-lib'] } });
  });

  it('accepts ttf-twemoji comma case from #885', () => {
    const result = parsePackageRequest('[Request] ttf-twemoji, ttf-twemoji-git', REQUEST_BODY);
    expect(result).toMatchObject({ ok: true, kind: 'request' });
  });
});

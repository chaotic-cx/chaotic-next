import { RenderMode } from '@angular/ssr';
import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';
import { serverRoutes } from './app.routes.server';
import redirectsFile from '../../public/_redirects?raw';

const CLIENT_SHELL = '/csr-shell';
const REWRITE_STATUS = '200';
const WILDCARD_PATH = '**';

function redirectSources(): Set<string> {
  const sources = new Set<string>();

  for (const line of redirectsFile.split('\n')) {
    const [source, target, status] = line.trim().split(/\s+/);
    if (!source || source.startsWith('#')) continue;

    expect(target).toBe(CLIENT_SHELL);
    expect(status).toBe(REWRITE_STATUS);
    sources.add(source);
  }

  return sources;
}

function prerenderedPaths(): Set<string> {
  const paths = serverRoutes.filter((route) => route.renderMode === RenderMode.Prerender).map((route) => route.path);
  return new Set(paths);
}

function clientRoutes() {
  const prerendered = prerenderedPaths();
  return routes.filter(
    (route) => route.path !== undefined && route.path !== WILDCARD_PATH && !prerendered.has(route.path),
  );
}

describe('_redirects', () => {
  const sources = redirectSources();

  it.each(clientRoutes().map((route) => [route.path, route] as const))(
    'serves the client shell for /%s',
    (path, route) => {
      const [firstSegment] = path.split('/');
      const hasSubpaths = path.includes('/') || (route.children?.length ?? 0) > 0;

      if (hasSubpaths) {
        expect(sources).toContain(`/${firstSegment}/*`);
      }

      if (!path.includes('/')) {
        expect(sources).toContain(`/${firstSegment}`);
      }
    },
  );

  it('never rewrites a prerendered route to the client shell', () => {
    for (const path of prerenderedPaths()) {
      expect(sources).not.toContain(`/${path}`);
    }
  });
});

import { readFileSync, writeFileSync } from 'node:fs';

const BUILD_DIR = 'dist/frontend';
const PRERENDERED_ROUTES_FILE = `${BUILD_DIR}/prerendered-routes.json`;
const SITEMAP_FILE = `${BUILD_DIR}/browser/sitemap-index.xml`;
const ENVIRONMENT_FILE = 'frontend/src/environments/environment.prod.ts';
const HOME_URL_PATTERN = /homeUrl:\s*'([^']+)'/;

const EXCLUDED_ROUTES = new Set(['/not-found', '/app-shell']);
const CLIENT_ROUTES = ['/stats', '/packages', '/deployments', '/mirrors', '/status'];

function readSiteUrl() {
  const environment = readFileSync(ENVIRONMENT_FILE, 'utf8');
  const match = HOME_URL_PATTERN.exec(environment);
  if (!match) {
    throw new Error(`No homeUrl found in ${ENVIRONMENT_FILE}`);
  }

  return match[1];
}

function readPrerenderedRoutes() {
  const file = JSON.parse(readFileSync(PRERENDERED_ROUTES_FILE, 'utf8'));
  const routes = [];
  for (const route of Object.keys(file.routes)) {
    if (EXCLUDED_ROUTES.has(route)) continue;

    routes.push(route);
  }

  return routes;
}

function escapeXml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function sitemapXml(siteUrl, routes) {
  const entries = [];
  for (const route of routes) {
    const url = new URL(route, siteUrl).toString();
    entries.push(`  <url>\n    <loc>${escapeXml(url)}</loc>\n  </url>`);
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

const routes = new Set([...readPrerenderedRoutes(), ...CLIENT_ROUTES]);
writeFileSync(SITEMAP_FILE, sitemapXml(readSiteUrl(), routes));
console.log(`Sitemap: ${routes.size} URLs written to ${SITEMAP_FILE}`);

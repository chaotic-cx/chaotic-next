import { EnvironmentModel } from './environment.model';

export const environment: EnvironmentModel = {
  production: false,
  apiUrl: 'http://localhost:4200/api',
  backendUrl: 'http://localhost:4200/backend',
  cachedMetricsUrl: 'http://localhost:4200/backend/metrics',
  homeUrl: 'https://aur.chaotic.cx/',
  logsUrl: 'https://builds.garudalinux.org/logs/logs.html',
  mapUrl: 'https://status.chaotic.cx/map',
  metricsUrl: 'https://metrics.chaotic.cx/',
  mirrorsUrl: 'http://localhost:4200/router/mirrors.json',
  pkgUrl: 'https://cdn-mirror.chaotic.cx/chaotic-aur/x86_64/',
  primaryKey: '3056513887B78AEB',
  repoApiUrl: 'https://gitlab.com/api/v4/projects/54867625',
  repoUrl: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/tree/main/',
  repoUrlGaruda: 'https://gitlab.com/garuda-linux/pkgbuilds/-/tree/main/',
  repoId: 1,
  repoIdGaruda: 2,
};

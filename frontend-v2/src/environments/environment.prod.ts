import { EnvironmentModel } from './environment.model';

export const environment: EnvironmentModel = {
  production: true,
  apiUrl: 'https://builds.garudalinux.org/api',
  backendUrl: 'https://builds.garudalinux.org/backend',
  cachedMetricsUrl: 'https://builds.garudalinux.org/backend/metrics',
  homeUrl: 'https://aur.chaotic.cx/',
  logsUrl: 'https://builds.garudalinux.org/logs/logs.html',
  mapUrl: 'https://status.chaotic.cx/map',
  metricsUrl: 'https://metrics.chaotic.cx/',
  newsId: '-1001293714071',
  pkgUrl: 'https://cdn-mirror.chaotic.cx/chaotic-aur/x86_64/',
  primaryKey: '3056513887B78AEB',
  repoApiUrl: 'https://gitlab.com/api/v4/projects/54867625',
  repoUrl: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/tree/main/',
  repoUrlGaruda: 'https://gitlab.com/garuda-linux/pkgbuilds/-/tree/main/',
  tgApiUrl: 'https://builds.garudalinux.org/backend/telegram',
};

import { type Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { backendChildGuard, backendGuard } from './backend-status/backend-required.guard';
import { AUTH_PRELOAD_DATA, SKIP_PRELOAD_DATA } from './preload.strategy';

export const routes: Routes = [
  {
    title: 'Chaotic-AUR',
    path: '',
    loadComponent: () => import('./home/home.component').then((c) => c.HomeComponent),
  },
  {
    title: 'Get started · Chaotic-AUR',
    path: 'docs',
    loadComponent: () => import('./docs/docs.component').then((c) => c.DocsComponent),
  },
  {
    title: 'Privacy Policy · Chaotic-AUR',
    path: 'privacy',
    loadComponent: () => import('./privacy-policy/privacy-policy.component').then((c) => c.PrivacyPolicyComponent),
  },
  {
    title: 'Code of Conduct · Chaotic-AUR',
    path: 'code-of-conduct',
    loadComponent: () => import('./code-of-conduct/code-of-conduct.component').then((c) => c.CodeOfConductComponent),
  },
  {
    title: 'Build status · Chaotic-AUR',
    path: 'status',
    canActivate: [backendGuard],
    loadComponent: () => import('./build-status/build-status.component').then((c) => c.BuildStatusComponent),
  },
  {
    title: 'Deployments · Chaotic-AUR',
    path: 'deployments',
    canActivate: [backendGuard],
    loadComponent: () => import('./deploy-log/deploy-log.component').then((c) => c.DeployLogComponent),
  },
  {
    title: 'Packages · Chaotic-AUR',
    path: 'packages',
    canActivate: [backendGuard],
    loadComponent: () => import('./package-list/package-list.component').then((c) => c.PackageListComponent),
  },
  {
    title: 'AUR Scan · Chaotic-AUR',
    path: 'aur-scan',
    canActivate: [backendGuard],
    loadComponent: () => import('./aur-scan/pages/aur-scan-page.component').then((c) => c.AurScanPageComponent),
  },
  {
    title: 'Statistics and data · Chaotic-AUR',
    path: 'stats',
    canActivate: [backendGuard],
    loadComponent: () => import('./stats/stats.component').then((c) => c.StatsComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'search' },
      {
        path: 'search',
        loadComponent: () =>
          import('./stats/pages/stats-search-page.component').then((c) => c.StatsSearchPageComponent),
      },
      {
        path: 'globals',
        loadComponent: () =>
          import('./stats/pages/stats-globals-page.component').then((c) => c.StatsGlobalsPageComponent),
      },
      {
        path: 'downloads',
        loadComponent: () =>
          import('./stats/pages/stats-downloads-page.component').then((c) => c.StatsDownloadsPageComponent),
      },
      {
        path: 'update-review',
        loadComponent: () =>
          import('./stats/pages/stats-update-review-page.component').then((c) => c.StatsUpdateReviewPageComponent),
      },
      {
        path: 'builder-stats',
        loadComponent: () =>
          import('./stats/pages/stats-builder-stats-page.component').then((c) => c.StatsBuilderStatsPageComponent),
      },
      {
        path: 'resource-usage',
        loadComponent: () =>
          import('./stats/pages/stats-resource-usage-page.component').then((c) => c.StatsResourceUsagePageComponent),
      },
      {
        path: 'additions',
        loadComponent: () =>
          import('./stats/pages/stats-additions-page.component').then((c) => c.StatsAdditionsPageComponent),
      },
      {
        path: 'insights',
        loadComponent: () =>
          import('./stats/pages/stats-insights-page.component').then((c) => c.StatsInsightsPageComponent),
      },
    ],
  },
  {
    title: 'Review queue · Chaotic-AUR',
    path: 'review-queue',
    canActivate: [backendGuard],
    loadComponent: () => import('./mr-overview/mr-overview.component').then((c) => c.MrOverviewComponent),
  },
  {
    path: 'update-review',
    redirectTo: 'review-queue',
  },
  {
    title: 'Pipeline logs · Chaotic-AUR',
    path: 'logs/:pipelineId',
    canActivate: [backendGuard],
    loadComponent: () => import('./log-viewer/log-viewer.component').then((c) => c.LogViewerComponent),
  },
  {
    title: 'Package log · Chaotic-AUR',
    path: 'logs/package/:pkgname/:timestamp',
    canActivate: [backendGuard],
    loadComponent: () => import('./package-log/package-log.component').then((c) => c.PackageLogComponent),
  },
  {
    title: 'Mirrors · Chaotic-AUR',
    path: 'mirrors',
    loadComponent: () => import('./mirrors/mirrors.component').then((c) => c.MirrorsComponent),
  },
  {
    title: 'Mirror map · Chaotic-AUR',
    path: 'map',
    canActivate: [backendGuard],
    loadComponent: () => import('./map/map.component').then((c) => c.MapComponent),
  },
  {
    title: 'Memorial 2024 · Chaotic-AUR',
    path: 'memorial-v2',
    data: SKIP_PRELOAD_DATA,
    loadComponent: () => import('./memorial-v2/memorial-v2.component').then((c) => c.MemorialV2Component),
  },
  {
    title: 'About us · Chaotic-AUR',
    path: 'about',
    loadComponent: () => import('./about/about.component').then((c) => c.AboutComponent),
  },
  {
    title: 'Memorial 2021 · Chaotic-AUR',
    path: 'memorial',
    data: SKIP_PRELOAD_DATA,
    loadComponent: () => import('./memorial/memorial.component').then((c) => c.MemorialComponent),
  },
  {
    title: 'Sign in · Chaotic-AUR',
    path: 'login',
    data: SKIP_PRELOAD_DATA,
    loadComponent: () => import('./login/login.component').then((c) => c.LoginComponent),
  },
  {
    path: 'auth/callback',
    data: SKIP_PRELOAD_DATA,
    loadComponent: () => import('./auth/auth-callback.component').then((c) => c.AuthCallbackComponent),
  },
  {
    title: 'Admin · Chaotic-AUR',
    path: 'admin',
    canActivate: [authGuard],
    canActivateChild: [backendChildGuard],
    data: AUTH_PRELOAD_DATA,
    loadComponent: () => import('./admin/admin.component').then((c) => c.AdminComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'packages' },
      {
        path: 'packages',
        data: AUTH_PRELOAD_DATA,
        loadComponent: () =>
          import('./admin/pages/admin-packages-page.component').then((c) => c.AdminPackagesPageComponent),
      },
      {
        path: 'arch',
        data: AUTH_PRELOAD_DATA,
        loadComponent: () =>
          import('./admin/pages/admin-arch-packages-page.component').then((c) => c.AdminArchPackagesPageComponent),
      },
      {
        path: 'repos',
        data: AUTH_PRELOAD_DATA,
        loadComponent: () => import('./admin/pages/admin-repos-page.component').then((c) => c.AdminReposPageComponent),
      },
      {
        path: 'builders',
        data: AUTH_PRELOAD_DATA,
        loadComponent: () =>
          import('./admin/pages/admin-builders-page.component').then((c) => c.AdminBuildersPageComponent),
      },
      {
        path: 'mr-actions',
        data: AUTH_PRELOAD_DATA,
        loadComponent: () =>
          import('./admin/pages/admin-mr-actions-page.component').then((c) => c.AdminMrActionsPageComponent),
      },
      {
        path: 'pipeline-triggers',
        data: AUTH_PRELOAD_DATA,
        loadComponent: () =>
          import('./admin/pages/admin-pipeline-triggers-page.component').then(
            (c) => c.AdminPipelineTriggersPageComponent,
          ),
      },
      {
        path: 'package-bumps',
        data: AUTH_PRELOAD_DATA,
        loadComponent: () =>
          import('./admin/pages/admin-package-bumps-page.component').then((c) => c.AdminPackageBumpsPageComponent),
      },
      {
        path: 'package-elf-analysis',
        data: AUTH_PRELOAD_DATA,
        loadComponent: () =>
          import('./admin/pages/admin-package-elf-analysis-page.component').then(
            (c) => c.AdminPackageElfAnalysisPageComponent,
          ),
      },
      {
        path: 'repo-operations',
        data: AUTH_PRELOAD_DATA,
        loadComponent: () =>
          import('./admin/pages/admin-repo-operations-page.component').then((c) => c.AdminRepoOperationsPageComponent),
      },
      {
        path: 'manager-logs',
        data: AUTH_PRELOAD_DATA,
        loadComponent: () =>
          import('./admin/pages/admin-manager-logs-page.component').then((c) => c.AdminManagerLogsPageComponent),
      },
    ],
  },
  {
    title: 'Backend unavailable · Chaotic-AUR',
    path: 'backend-down',
    data: SKIP_PRELOAD_DATA,
    loadComponent: () => import('./backend-down/backend-down.component').then((c) => c.BackendDownComponent),
  },
  {
    title: 'Not found · Chaotic-AUR',
    path: 'not-found',
    data: SKIP_PRELOAD_DATA,
    loadComponent: () => import('./not-found/not-found.component').then((c) => c.NotFoundComponent),
  },
  {
    path: '**',
    redirectTo: 'not-found',
  },
];

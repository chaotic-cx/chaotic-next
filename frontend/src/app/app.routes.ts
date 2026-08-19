import { type Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    title: 'Chaotic-AUR',
    path: '',
    loadComponent: () => import('./home/home.component').then((c) => c.HomeComponent),
  },
  {
    title: 'Get started',
    path: 'docs',
    loadComponent: () => import('./docs/docs.component').then((c) => c.DocsComponent),
  },
  {
    title: 'Build status',
    path: 'status',
    loadComponent: () => import('./build-status/build-status.component').then((c) => c.BuildStatusComponent),
  },
  {
    title: 'Deployments',
    path: 'deployments',
    loadComponent: () => import('./deploy-log/deploy-log.component').then((c) => c.DeployLogComponent),
  },
  {
    title: 'Packages',
    path: 'packages',
    loadComponent: () => import('./package-list/package-list.component').then((c) => c.PackageListComponent),
  },
  {
    title: 'Statistics and data',
    path: 'stats',
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
    ],
  },
  {
    title: 'Update review',
    path: 'update-review',
    loadComponent: () => import('./mr-overview/mr-overview.component').then((c) => c.MrOverviewComponent),
  },
  {
    title: 'Pipeline trigger',
    path: 'pipeline-trigger',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pipeline-trigger/pipeline-trigger.component').then((c) => c.PipelineTriggerComponent),
  },
  {
    title: 'Pipeline logs',
    path: 'logs/:pipelineId',
    loadComponent: () => import('./log-viewer/log-viewer.component').then((c) => c.LogViewerComponent),
  },
  {
    title: 'Package log',
    path: 'logs/package/:pkgname/:timestamp',
    loadComponent: () => import('./package-log/package-log.component').then((c) => c.PackageLogComponent),
  },
  {
    title: 'Mirrors',
    path: 'mirrors',
    loadComponent: () => import('./mirrors/mirrors.component').then((c) => c.MirrorsComponent),
  },
  {
    title: 'Mirror map',
    path: 'map',
    loadComponent: () => import('./map/map.component').then((c) => c.MapComponent),
  },
  {
    title: 'Memorial 2024',
    path: 'memorial-v2',
    loadComponent: () => import('./memorial-v2/memorial-v2.component').then((c) => c.MemorialV2Component),
  },
  {
    title: 'About us',
    path: 'about',
    loadComponent: () => import('./about/about.component').then((c) => c.AboutComponent),
  },
  {
    title: 'Memorial 2021',
    path: 'memorial',
    loadComponent: () => import('./memorial/memorial.component').then((c) => c.MemorialComponent),
  },
  {
    title: 'Sign in',
    path: 'login',
    loadComponent: () => import('./login/login.component').then((c) => c.LoginComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./auth/auth-callback.component').then((c) => c.AuthCallbackComponent),
  },
  {
    title: 'Admin',
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/admin.component').then((c) => c.AdminComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'packages' },
      {
        path: 'packages',
        loadComponent: () =>
          import('./admin/pages/admin-packages-page.component').then((c) => c.AdminPackagesPageComponent),
      },
      {
        path: 'arch',
        loadComponent: () =>
          import('./admin/pages/admin-arch-packages-page.component').then((c) => c.AdminArchPackagesPageComponent),
      },
      {
        path: 'repos',
        loadComponent: () => import('./admin/pages/admin-repos-page.component').then((c) => c.AdminReposPageComponent),
      },
      {
        path: 'builders',
        loadComponent: () =>
          import('./admin/pages/admin-builders-page.component').then((c) => c.AdminBuildersPageComponent),
      },
      {
        path: 'mr-actions',
        loadComponent: () =>
          import('./admin/pages/admin-mr-actions-page.component').then((c) => c.AdminMrActionsPageComponent),
      },
      {
        path: 'pipeline-triggers',
        loadComponent: () =>
          import('./admin/pages/admin-pipeline-triggers-page.component').then(
            (c) => c.AdminPipelineTriggersPageComponent,
          ),
      },
      {
        path: 'package-bumps',
        loadComponent: () =>
          import('./admin/pages/admin-package-bumps-page.component').then((c) => c.AdminPackageBumpsPageComponent),
      },
      {
        path: 'package-elf-analysis',
        loadComponent: () =>
          import('./admin/pages/admin-package-elf-analysis-page.component').then(
            (c) => c.AdminPackageElfAnalysisPageComponent,
          ),
      },
      {
        path: 'aur-scan',
        loadComponent: () =>
          import('./admin/pages/admin-aur-scan-page.component').then((c) => c.AdminAurScanPageComponent),
      },
      {
        path: 'repo-operations',
        loadComponent: () =>
          import('./admin/pages/admin-repo-operations-page.component').then((c) => c.AdminRepoOperationsPageComponent),
      },
    ],
  },
  {
    title: 'Not found',
    path: 'not-found',
    loadComponent: () => import('./not-found/not-found.component').then((c) => c.NotFoundComponent),
  },
  {
    path: '**',
    redirectTo: 'not-found',
  },
];

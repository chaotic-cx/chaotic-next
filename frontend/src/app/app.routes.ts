import { type Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { authGuard } from './auth/auth.guard';
import { backendChildGuard, backendGuard } from './backend-status/backend-required.guard';
import { translationScopeResolver } from './i18n/translation-scope.resolver';
import { MEMORIAL_2021, MEMORIAL_2024 } from './memorial/memorial.configs';
import { AUTH_PRELOAD_DATA, SKIP_PRELOAD_DATA } from './preload.strategy';

const TRANSLATION_SCOPE_RESOLVE = { translations: translationScopeResolver };

export const routes: Routes = [
  {
    title: marker('routes.home'),
    path: '',
    loadComponent: () => import('./home/home.component').then((c) => c.HomeComponent),
  },
  {
    title: marker('routes.docs'),
    providers: [provideTranslocoScope('docs')],
    resolve: TRANSLATION_SCOPE_RESOLVE,
    path: 'docs',
    loadComponent: () => import('./docs/docs.component').then((c) => c.DocsComponent),
  },
  {
    title: marker('routes.privacy'),
    providers: [provideTranslocoScope('privacy-policy')],
    resolve: TRANSLATION_SCOPE_RESOLVE,
    path: 'privacy',
    loadComponent: () => import('./privacy-policy/privacy-policy.component').then((c) => c.PrivacyPolicyComponent),
  },
  {
    title: marker('routes.codeOfConduct'),
    providers: [provideTranslocoScope('code-of-conduct')],
    resolve: TRANSLATION_SCOPE_RESOLVE,
    path: 'code-of-conduct',
    loadComponent: () => import('./code-of-conduct/code-of-conduct.component').then((c) => c.CodeOfConductComponent),
  },
  {
    title: marker('routes.buildStatus'),
    path: 'status',
    canActivate: [backendGuard],
    loadComponent: () => import('./build-status/build-status.component').then((c) => c.BuildStatusComponent),
  },
  {
    title: marker('routes.deployments'),
    path: 'deployments',
    canActivate: [backendGuard],
    loadComponent: () => import('./deploy-log/deploy-log.component').then((c) => c.DeployLogComponent),
  },
  {
    title: marker('routes.packages'),
    path: 'packages',
    canActivate: [backendGuard],
    loadComponent: () => import('./package-list/package-list.component').then((c) => c.PackageListComponent),
  },
  {
    title: marker('routes.aurScan'),
    path: 'aur-scan',
    canActivate: [backendGuard],
    loadComponent: () => import('./aur-scan/pages/aur-scan-page.component').then((c) => c.AurScanPageComponent),
  },
  {
    title: marker('routes.stats'),
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
    title: marker('routes.reviewQueue'),
    path: 'review-queue',
    canActivate: [backendGuard],
    loadComponent: () => import('./mr-overview/mr-overview.component').then((c) => c.MrOverviewComponent),
  },
  {
    path: 'update-review',
    redirectTo: 'review-queue',
  },
  {
    title: marker('routes.pipelineLogs'),
    path: 'logs/:pipelineId',
    data: SKIP_PRELOAD_DATA,
    canActivate: [backendGuard],
    loadComponent: () => import('./log-viewer/log-viewer.component').then((c) => c.LogViewerComponent),
  },
  {
    title: marker('routes.packageLog'),
    path: 'logs/package/:pkgname/:timestamp',
    data: SKIP_PRELOAD_DATA,
    canActivate: [backendGuard],
    loadComponent: () => import('./package-log/package-log.component').then((c) => c.PackageLogComponent),
  },
  {
    title: marker('routes.mirrors'),
    path: 'mirrors',
    loadComponent: () => import('./mirrors/mirrors.component').then((c) => c.MirrorsComponent),
  },
  {
    title: marker('routes.mirrorMap'),
    path: 'map',
    data: SKIP_PRELOAD_DATA,
    canActivate: [backendGuard],
    loadComponent: () => import('./map/map.component').then((c) => c.MapComponent),
  },
  {
    title: marker('routes.memorial2024'),
    providers: [provideTranslocoScope('memorial')],
    resolve: TRANSLATION_SCOPE_RESOLVE,
    path: 'memorial-v2',
    data: { ...SKIP_PRELOAD_DATA, memorial: MEMORIAL_2024 },
    loadComponent: () => import('./memorial/memorial.component').then((c) => c.MemorialComponent),
  },
  {
    title: marker('routes.settings'),
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./settings/settings.component').then((c) => c.SettingsComponent),
  },
  {
    title: marker('routes.about'),
    providers: [provideTranslocoScope('about')],
    resolve: TRANSLATION_SCOPE_RESOLVE,
    path: 'about',
    loadComponent: () => import('./about/about.component').then((c) => c.AboutComponent),
  },
  {
    title: marker('routes.memorial2021'),
    providers: [provideTranslocoScope('memorial')],
    resolve: TRANSLATION_SCOPE_RESOLVE,
    path: 'memorial',
    data: { ...SKIP_PRELOAD_DATA, memorial: MEMORIAL_2021 },
    loadComponent: () => import('./memorial/memorial.component').then((c) => c.MemorialComponent),
  },
  {
    title: marker('routes.login'),
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
    title: marker('routes.admin'),
    providers: [provideTranslocoScope('admin')],
    resolve: TRANSLATION_SCOPE_RESOLVE,
    path: 'admin',
    canActivate: [authGuard],
    canActivateChild: [backendChildGuard],
    data: AUTH_PRELOAD_DATA,
    loadComponent: () => import('./admin/admin.component').then((c) => c.AdminComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        data: AUTH_PRELOAD_DATA,
        loadComponent: () =>
          import('./admin/overview/admin-overview-page.component').then((c) => c.AdminOverviewPageComponent),
      },
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
    title: marker('routes.backendDown'),
    path: 'backend-down',
    data: SKIP_PRELOAD_DATA,
    loadComponent: () => import('./backend-down/backend-down.component').then((c) => c.BackendDownComponent),
  },
  {
    title: marker('routes.notFound'),
    path: 'not-found',
    data: SKIP_PRELOAD_DATA,
    loadComponent: () => import('./not-found/not-found.component').then((c) => c.NotFoundComponent),
  },
  {
    path: '**',
    redirectTo: 'not-found',
  },
];

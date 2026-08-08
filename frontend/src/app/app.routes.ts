import { type Routes } from '@angular/router';

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
  },
  {
    title: 'Update review',
    path: 'update-review',
    loadComponent: () => import('./mr-overview/mr-overview.component').then((c) => c.MrOverviewComponent),
  },
  {
    title: 'Mirrors',
    path: 'mirrors',
    loadComponent: () => import('./mirrors/mirrors.component').then((c) => c.MirrorsComponent),
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
    title: 'Not found',
    path: 'not-found',
    loadComponent: () => import('./not-found/not-found.component').then((c) => c.NotFoundComponent),
  },
  {
    path: '**',
    redirectTo: 'not-found',
  },
];

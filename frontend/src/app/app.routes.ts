import {
  animate,
  type AnimationGroupMetadata,
  type AnimationQueryMetadata,
  type AnimationTriggerMetadata,
  group,
  query,
  style,
  transition,
  trigger,
} from '@angular/animations';
import { NgModule } from '@angular/core';
import { RouterModule, type Routes } from '@angular/router';
import { BuildStatusComponent } from './build-status/build-status.component';
import { DeployLogComponent } from './deploy-log/deploy-log.component';
import { DocsComponent } from './docs/docs.component';
import { HomeComponent } from './home/home.component';

export const routes: Routes = [
  {
    title: 'Chaotic-AUR',
    path: '',
    component: HomeComponent,
    data: { animationState: '1' },
  },
  {
    title: 'Get started',
    path: 'docs',
    component: DocsComponent,
    data: { animationState: '2' },
  },
  {
    title: 'Build status',
    path: 'status',
    component: BuildStatusComponent,
    data: { animationState: '3' },
  },
  {
    title: 'Deployments',
    path: 'deployments',
    component: DeployLogComponent,
    data: { animationState: '4' },
  },
  {
    title: 'Packages',
    path: 'packages',
    loadComponent: () => import('./package-list/package-list.component').then((c) => c.PackageListComponent),
    data: { animationState: '5' },
  },
  {
    title: 'Statistics and data',
    path: 'stats',
    loadComponent: () => import('./package-stats/package-stats.component').then((c) => c.PackageStatsComponent),
    data: { animationState: '6' },
  },
  {
    title: 'Merge requests',
    path: 'merge-requests',
    loadComponent: () => import('./mr-overview/mr-overview.component').then((c) => c.MrOverviewComponent),
    data: { animationState: 'null' },
  },
  {
    title: 'Mirrors',
    path: 'mirrors',
    loadComponent: () => import('./mirrors/mirrors.component').then((c) => c.MirrorsComponent),
    data: { animationState: '7' },
  },
  {
    title: 'Memorial 2024',
    path: 'memorial-v2',
    loadComponent: () => import('./memorial-v2/memorial-v2.component').then((c) => c.MemorialV2Component),
    data: { animationState: '8' },
  },
  {
    title: 'About us',
    path: 'about',
    loadComponent: () => import('./about/about.component').then((c) => c.AboutComponent),
    data: { animationState: '9' },
  },
  {
    title: 'Memorial 2021',
    path: 'memorial',
    loadComponent: () => import('./memorial/memorial.component').then((c) => c.MemorialComponent),
    data: { animationState: 'null' },
  },
  {
    title: 'Not found',
    path: 'not-found',
    loadComponent: () => import('./not-found/not-found.component').then((c) => c.NotFoundComponent),
    data: { animationState: 'null' },
  },
  {
    path: '**',
    redirectTo: 'not-found',
    data: { animationState: 'null' },
  },
];

/**
 * A generic fade animation, for use in the router link animations.
 */
const fade: (AnimationQueryMetadata | AnimationGroupMetadata)[] = [
  query(':enter, :leave', style({ position: 'fixed', width: '100%' }), { optional: true }),
  query(':enter', [style({ opacity: 0 })], { optional: true }),
  group([
    query(':leave', [animate('0.4s ease-out', style({ opacity: 0 }))], { optional: true }),
    query(':enter', [style({ opacity: 0 }), animate('0.4s ease-out', style({ opacity: 1 }))], { optional: true }),
  ]),
];

/**
 * Animation metadata for router link transitions.
 * Fades between pages.
 * @param direction the direction the animation should go into.
 */
const fadeInFromDirection = (direction: string): (AnimationQueryMetadata | AnimationGroupMetadata)[] => [
  query(':enter, :leave', style({ position: 'fixed', width: '100%' }), { optional: true }),
  group([
    query(
      ':enter',
      [
        style({
          transform: `translateX(${direction === 'backward' ? '-' : ''}15%)`,
          opacity: 0,
        }),
        animate('0.1s ease-out', style({ transform: 'translateX(0%)', opacity: 1 })),
      ],
      { optional: true },
    ),
    query(':leave', [style({ transform: 'translateX(0%)' }), animate('0.3s ease-out', style({ opacity: 0 }))], {
      optional: true,
    }),
  ]),
];

/**
 * Produces the strings needed for any forward transitions.
 * @returns A string like "0 => 1, 1 => 2, 0 => 2"
 */
function forwardValues(): string {
  let result = '';
  for (let i = 0; i <= 8; i++) {
    for (let j = i + 1; j <= 9; j++) {
      result += `${i} => ${j}, `;
    }
  }
  return result.slice(0, -2);
}

/**
 * Produces the strings needed for any backward transitions.
 * @returns A string like "2 => 1, 1 => 0, 2 => 0"
 */
function backwardValues(): string {
  let result = '';
  for (let i = 9; i >= 0; i--) {
    for (let j = i - 1; j >= 0; j--) {
      result += `${i} => ${j}, `;
    }
  }
  return result.slice(0, -2);
}

/**
 * This constant holds any page transition rules, triggered from the router outlet.
 */
export const routeAnimations: AnimationTriggerMetadata = trigger('routerTransition', [
  transition(forwardValues(), fadeInFromDirection('forward')),
  transition(backwardValues(), fadeInFromDirection('backward')),
  transition('* => null, null => *', fade),
]);

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}

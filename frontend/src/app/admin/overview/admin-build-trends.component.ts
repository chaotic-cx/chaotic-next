import { NgTemplateOutlet } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppService } from '../../app.service';
import { resourceFailed, resourceValue } from '../../functions';
import { LoadErrorComponent } from '../../load-error/load-error.component';
import type { BuilderUtilizationRowDto } from '../../stats/charts/builds/chart-builder-utilization/chart-builder-utilization.component';
import type { FlakyPackageRow } from '../../stats/charts/builds/chart-flaky-packages/chart-flaky-packages.component';
import { AdminBarListComponent, type BarRow } from './admin-bar-list.component';
import { OVERVIEW_SKELETON_ROWS } from './overview-constants';

const FLAKY_WINDOW_DAYS = 30;
const BUILDER_WINDOW_DAYS = 7;
const VISIBLE_ROWS = 6;
const PERCENT = 100;

@Component({
  selector: 'chaotic-admin-build-trends',
  imports: [AdminBarListComponent, LoadErrorComponent, NgTemplateOutlet, RouterLink],
  template: `
    <section class="chaotic-card h-full" aria-labelledby="overview-flaky-title">
      <header class="chaotic-card__header">
        <h2 class="chaotic-card__title" id="overview-flaky-title">Flakiest packages</h2>
        <span class="trend-window">30 days</span>
        <a class="chaotic-card__link" routerLink="/stats/insights">Insights</a>
      </header>
      @if (flakyLoading()) {
        <ng-container *ngTemplateOutlet="skeleton" />
      } @else if (flakyFailed()) {
        <chaotic-load-error (retry)="flakyResource.reload()" message="Could not load flaky packages." />
      } @else if (flakyRows().length === 0) {
        <p class="chaotic-card__empty">No package failed and succeeded in turn.</p>
      } @else {
        <chaotic-admin-bar-list [rows]="flakyRows()" />
      }
    </section>

    <section class="chaotic-card h-full" aria-labelledby="overview-builders-title">
      <header class="chaotic-card__header">
        <h2 class="chaotic-card__title" id="overview-builders-title">Builder load</h2>
        <span class="trend-window">7 days</span>
        <a class="chaotic-card__link" routerLink="/stats/insights">Insights</a>
      </header>
      @if (builderLoading()) {
        <ng-container *ngTemplateOutlet="skeleton" />
      } @else if (builderFailed()) {
        <chaotic-load-error (retry)="builderResource.reload()" message="Could not load builder load." />
      } @else if (builderRows().length === 0) {
        <p class="chaotic-card__empty">No builds in the last 7 days.</p>
      } @else {
        <chaotic-admin-bar-list [rows]="builderRows()" />
      }
    </section>

    <ng-template #skeleton>
      <ul class="chaotic-mini-list" aria-hidden="true">
        @for (row of skeletonRows; track row) {
          <li><span class="chaotic-skeleton h-4 w-full"></span></li>
        }
      </ul>
    </ng-template>
  `,
  styles: `
    :host {
      display: contents;
    }

    .trend-window {
      font-size: 0.75rem;
      color: var(--ctp-mocha-overlay1);
    }
  `,
})
export class AdminBuildTrendsComponent {
  private readonly appService = inject(AppService);

  protected readonly skeletonRows = OVERVIEW_SKELETON_ROWS;

  protected readonly flakyResource = httpResource<FlakyPackageRow[]>(() =>
    this.appService.getFlakiestPackagesResourceRequest(FLAKY_WINDOW_DAYS),
  );
  protected readonly builderResource = httpResource<BuilderUtilizationRowDto[]>(() =>
    this.appService.getBuilderUtilizationResourceRequest(BUILDER_WINDOW_DAYS),
  );

  protected readonly flakyFailed = resourceFailed(this.flakyResource);
  protected readonly flakyLoading = computed(() => this.flakyResource.isLoading() && !this.flakyResource.hasValue());
  protected readonly flakyRows = computed<BarRow[]>(() =>
    (resourceValue(this.flakyResource) ?? []).slice(0, VISIBLE_ROWS).map((row) => ({
      label: row.pkgname,
      share: row.flakiness,
      detail: `${Math.round(row.flakiness * PERCENT)}% of ${row.attempts}`,
    })),
  );

  protected readonly builderFailed = resourceFailed(this.builderResource);
  protected readonly builderLoading = computed(
    () => this.builderResource.isLoading() && !this.builderResource.hasValue(),
  );
  protected readonly builderRows = computed<BarRow[]>(() =>
    builderLoadRows(resourceValue(this.builderResource) ?? []).slice(0, VISIBLE_ROWS),
  );
}

function builderLoadRows(rows: BuilderUtilizationRowDto[]): BarRow[] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.builder, (totals.get(row.builder) ?? 0) + row.count);

  const busiest = Math.max(0, ...totals.values());
  return [...totals.entries()]
    .toSorted(([, left], [, right]) => right - left)
    .map(([builder, builds]) => ({
      label: builder,
      share: busiest > 0 ? builds / busiest : 0,
      detail: `${builds} builds`,
    }));
}

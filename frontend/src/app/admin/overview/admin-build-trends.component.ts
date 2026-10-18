import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AppService } from '../../app.service';
import { resourceFailed, resourceValue } from '../../functions';
import { injectActiveTranslation } from '../../i18n/active-translation';
import { LoadErrorComponent } from '../../load-error/load-error.component';
import { SkeletonListComponent } from '../../table-skeleton/skeleton-list.component';
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
  imports: [AdminBarListComponent, LoadErrorComponent, RouterLink, SkeletonListComponent, TranslocoDirective],
  template: `
    <ng-container *transloco="let t; prefix: 'admin.overview.buildTrends'">
      <section class="chaotic-card h-full" aria-labelledby="overview-flaky-title">
        <header class="chaotic-card__header">
          <h2 class="chaotic-card__title" id="overview-flaky-title">{{ t('flaky.title') }}</h2>
          <span class="trend-window">{{ t('windowDays', { days: flakyWindowDays }) }}</span>
          <a class="chaotic-card__link" routerLink="/stats/insights">{{ t('insightsLink') }}</a>
        </header>
        @if (flakyLoading()) {
          <chaotic-skeleton-list [rows]="skeletonRows" />
        } @else if (flakyFailed()) {
          <chaotic-load-error
            [message]="t('flaky.loadError')"
            [error]="flakyResource.error()"
            (retry)="flakyResource.reload()"
          />
        } @else if (flakyRows().length === 0) {
          <p class="chaotic-card__empty">{{ t('flaky.empty') }}</p>
        } @else {
          <chaotic-admin-bar-list [rows]="flakyRows()" />
        }
      </section>

      <section class="chaotic-card h-full" aria-labelledby="overview-builders-title">
        <header class="chaotic-card__header">
          <h2 class="chaotic-card__title" id="overview-builders-title">{{ t('builders.title') }}</h2>
          <span class="trend-window">{{ t('windowDays', { days: builderWindowDays }) }}</span>
          <a class="chaotic-card__link" routerLink="/stats/insights">{{ t('insightsLink') }}</a>
        </header>
        @if (builderLoading()) {
          <chaotic-skeleton-list [rows]="skeletonRows" />
        } @else if (builderFailed()) {
          <chaotic-load-error
            [message]="t('builders.loadError')"
            [error]="builderResource.error()"
            (retry)="builderResource.reload()"
          />
        } @else if (builderRows().length === 0) {
          <p class="chaotic-card__empty">{{ t('builders.empty', { days: builderWindowDays }) }}</p>
        } @else {
          <chaotic-admin-bar-list [rows]="builderRows()" />
        }
      </section>
    </ng-container>
  `,
  styles: `
    :host {
      display: contents;
    }

    .trend-window {
      font-size: 0.75rem;
      color: var(--chaotic-fg-faint);
    }
  `,
})
export class AdminBuildTrendsComponent {
  private readonly appService = inject(AppService);
  private readonly transloco = inject(TranslocoService);
  private readonly activeTranslation = injectActiveTranslation();

  protected readonly flakyWindowDays = FLAKY_WINDOW_DAYS;
  protected readonly builderWindowDays = BUILDER_WINDOW_DAYS;
  protected readonly skeletonRows = OVERVIEW_SKELETON_ROWS;

  protected readonly flakyResource = httpResource<FlakyPackageRow[]>(() =>
    this.appService.getFlakiestPackagesResourceRequest(FLAKY_WINDOW_DAYS),
  );
  protected readonly builderResource = httpResource<BuilderUtilizationRowDto[]>(() =>
    this.appService.getBuilderUtilizationResourceRequest(BUILDER_WINDOW_DAYS),
  );

  protected readonly flakyFailed = resourceFailed(this.flakyResource);
  protected readonly flakyLoading = computed(() => this.flakyResource.isLoading() && !this.flakyResource.hasValue());
  protected readonly flakyRows = computed<BarRow[]>(() => {
    this.activeTranslation();

    return (resourceValue(this.flakyResource) ?? []).slice(0, VISIBLE_ROWS).map((row) => ({
      label: row.pkgname,
      share: row.flakiness,
      detail: this.transloco.translate('admin.overview.buildTrends.flaky.detail', {
        percent: Math.round(row.flakiness * PERCENT),
        attempts: row.attempts,
      }),
    }));
  });

  protected readonly builderFailed = resourceFailed(this.builderResource);
  protected readonly builderLoading = computed(
    () => this.builderResource.isLoading() && !this.builderResource.hasValue(),
  );
  protected readonly builderRows = computed<BarRow[]>(() => {
    this.activeTranslation();

    return builderLoadRows(resourceValue(this.builderResource) ?? [])
      .slice(0, VISIBLE_ROWS)
      .map((row) => ({
        label: row.builder,
        share: row.share,
        detail: this.transloco.translate('admin.overview.buildTrends.builders.detail', { count: row.builds }),
      }));
  });
}

interface BuilderLoadRow {
  builder: string;
  share: number;
  builds: number;
}

function builderLoadRows(rows: BuilderUtilizationRowDto[]): BuilderLoadRow[] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.builder, (totals.get(row.builder) ?? 0) + row.count);

  const busiest = Math.max(0, ...totals.values());
  return [...totals.entries()]
    .toSorted(([, left], [, right]) => right - left)
    .map(([builder, builds]) => ({
      builder,
      share: busiest > 0 ? builds / busiest : 0,
      builds,
    }));
}

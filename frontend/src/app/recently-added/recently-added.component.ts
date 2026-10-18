import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type Package, type Paginated, formatPkgrel } from '@chaotic-next/shared-lib';
import { TranslocoDirective } from '@jsverse/transloco';
import { TagModule } from '@openng/optimus-ui/tag';
import { AppService } from '../app.service';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { resourceValue } from '../functions';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { MISSING_VALUE } from '../table-columns/missing-value';
import { SlowLoadingHintComponent } from '../ui-states/slow-loading-hint.component';

const RECENT_COUNT = 9;
const STAGGER_CAP = 8;

@Component({
  selector: 'chaotic-recently-added',
  imports: [
    RouterLink,
    TagModule,
    RelativeTimePipe,
    TranslocoDirective,
    LoadErrorComponent,
    EmptyStateComponent,
    SlowLoadingHintComponent,
  ],
  templateUrl: './recently-added.component.html',
  styleUrl: './recently-added.component.css',
})
export class RecentlyAddedComponent {
  private readonly appService = inject(AppService);

  protected readonly resource = httpResource<Paginated<Package>>(() =>
    this.appService.getPackagesResourceRequest({ page: 1, perPage: RECENT_COUNT, sort: 'createdAt', order: 'DESC' }),
  );

  readonly packages = computed(() => resourceValue(this.resource)?.items ?? []);
  readonly loading = this.resource.isLoading;

  readonly placeholderCount = Array.from({ length: RECENT_COUNT });

  protected readonly STAGGER_CAP = STAGGER_CAP;

  protected versionLabel(pkg: Package): string {
    if (!pkg.version) return MISSING_VALUE;

    if (pkg.pkgrel === undefined) return pkg.version;

    return `${pkg.version}-${formatPkgrel(pkg.pkgrel, pkg.bump ?? 0)}`;
  }
}

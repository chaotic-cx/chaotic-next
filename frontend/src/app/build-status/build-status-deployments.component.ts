import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Skeleton } from '@openng/optimus-ui/skeleton';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { FlipListDirective } from '../animations/flip-list.directive';
import { packageLogRouteFromUrl, range } from '../functions';
import { LocaleDatePipe } from '../pipes/locale-date.pipe';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { BuildStatusPager } from './build-status-pager.component';
import { BuildStatusSectionComponent } from './build-status-section.component';
import { BuildStatusService } from './build-status.service';

const DEPLOYMENTS_SKELETON_COUNT = 5;
const DEPLOYMENTS_PAGE_SIZE = 5;

@Component({
  selector: 'chaotic-build-status-deployments',
  imports: [
    RouterLink,
    Skeleton,
    Tooltip,
    RelativeTimePipe,
    BuildStatusSectionComponent,
    LocaleDatePipe,
    BuildStatusPager,
    FlipListDirective,
  ],
  templateUrl: './build-status-deployments.component.html',
})
export class BuildStatusDeploymentsComponent {
  readonly buildStatusService = inject(BuildStatusService);
  readonly packageLogRouteFromUrl = packageLogRouteFromUrl;
  readonly createRange = range;
  readonly skeletonCount = DEPLOYMENTS_SKELETON_COUNT;

  private readonly page = signal(1);

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.buildStatusService.latestDeployments().length / DEPLOYMENTS_PAGE_SIZE)),
  );

  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));

  readonly paginatedDeployments = computed(() => {
    const deployments = this.buildStatusService.latestDeployments();
    const start = (this.currentPage() - 1) * DEPLOYMENTS_PAGE_SIZE;
    return deployments.slice(start, start + DEPLOYMENTS_PAGE_SIZE);
  });

  selectPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pageCount()));
  }
}

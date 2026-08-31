import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { FlipListDirective } from '../animations/flip-list.directive';
import { packageLogRouteFromUrl } from '../functions';
import { statusIconClass } from '../status-icons';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { BuildStatusPager } from './build-status-pager.component';
import { BuildStatusSectionComponent } from './build-status-section.component';
import { BuildStatusService } from './build-status.service';

const DEPLOYMENTS_PAGE_SIZE = 5;

const FAILURE_TAG_DESCRIPTIONS: Record<string, string> = {
  dependency: 'Missing dependency',
  compile: 'Compile error',
  link: 'Link error',
  package: 'Packaging error',
  check: 'Check failed',
  prepare: 'Prepare failed',
  toolchain: 'Toolchain issue',
  download: 'Download failed',
  network: 'Network error',
  checksum: 'Checksum mismatch',
  metadata: 'Metadata or pkgver issue',
  interfere: 'Interfere prepare failed (our tooling)',
  silent: 'Silent: resolves itself',
  transient: 'Transient: usually passes on retry',
};

@Component({
  selector: 'chaotic-build-status-deployments',
  imports: [
    DatePipe,
    RouterLink,
    Tooltip,
    RelativeTimePipe,
    BuildStatusSectionComponent,
    BuildStatusPager,
    FlipListDirective,
  ],
  templateUrl: './build-status-deployments.component.html',
})
export class BuildStatusDeploymentsComponent {
  readonly buildStatusService = inject(BuildStatusService);
  readonly packageLogRouteFromUrl = packageLogRouteFromUrl;
  readonly statusIconClass = statusIconClass;

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

  tagDescription(tag: string): string {
    return FAILURE_TAG_DESCRIPTIONS[tag] ?? tag;
  }
}

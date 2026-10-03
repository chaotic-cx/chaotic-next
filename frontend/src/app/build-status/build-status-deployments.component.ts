import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { FlipListDirective } from '../animations/flip-list.directive';
import { packageLogRouteFromUrl } from '../functions';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { statusIconClass } from '../status-icons';
import { BuildStatusPager } from './build-status-pager.component';
import { BuildStatusSectionComponent } from './build-status-section.component';
import { BuildStatusService } from './build-status.service';

const DEPLOYMENTS_PAGE_SIZE = 6;
const SKELETON_ROW_COUNT = 4;

const FAILURE_TAG_DESCRIPTION_KEYS: Record<string, string> = {
  dependency: marker('buildStatus.deployments.failureTags.dependency'),
  compile: marker('buildStatus.deployments.failureTags.compile'),
  link: marker('buildStatus.deployments.failureTags.link'),
  package: marker('buildStatus.deployments.failureTags.package'),
  check: marker('buildStatus.deployments.failureTags.check'),
  prepare: marker('buildStatus.deployments.failureTags.prepare'),
  toolchain: marker('buildStatus.deployments.failureTags.toolchain'),
  download: marker('buildStatus.deployments.failureTags.download'),
  network: marker('buildStatus.deployments.failureTags.network'),
  checksum: marker('buildStatus.deployments.failureTags.checksum'),
  metadata: marker('buildStatus.deployments.failureTags.metadata'),
  interfere: marker('buildStatus.deployments.failureTags.interfere'),
  silent: marker('buildStatus.deployments.failureTags.silent'),
  transient: marker('buildStatus.deployments.failureTags.transient'),
};

@Component({
  selector: 'chaotic-build-status-deployments',
  imports: [
    DatePipe,
    RouterLink,
    Tooltip,
    RelativeTimePipe,
    BuildStatusSectionComponent,
    LoadErrorComponent,
    BuildStatusPager,
    FlipListDirective,
    TranslocoDirective,
  ],
  templateUrl: './build-status-deployments.component.html',
})
export class BuildStatusDeploymentsComponent {
  readonly buildStatusService = inject(BuildStatusService);
  readonly packageLogRouteFromUrl = packageLogRouteFromUrl;
  readonly statusIconClass = statusIconClass;
  readonly skeletonRows = Array.from({ length: SKELETON_ROW_COUNT });

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

  tagDescriptionKey(tag: string): string | undefined {
    return FAILURE_TAG_DESCRIPTION_KEYS[tag];
  }
}

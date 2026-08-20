import { Component, computed, inject, signal } from '@angular/core';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { BuildStatusPager } from './build-status-pager.component';
import { BuildStatusSectionComponent } from './build-status-section.component';
import { BUILD_ESTIMATE_TOOLTIP, BuildStatusService } from './build-status.service';
import { sortByStartTime } from './queue-estimates';

const WAITING_PAGE_SIZE = 15;

@Component({
  selector: 'chaotic-build-status-waiting-builds',
  imports: [BuildStatusSectionComponent, BuildStatusPager, Tooltip, BuildClassPipe],
  templateUrl: './waiting-builds.component.html',
  styleUrl: './waiting-builds.component.css',
})
export class WaitingBuildsComponent {
  readonly buildStatusService = inject(BuildStatusService);
  readonly estimateTooltip = BUILD_ESTIMATE_TOOLTIP;

  private readonly page = signal(1);

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.buildStatusService.waitingQueue().length / WAITING_PAGE_SIZE)),
  );

  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));

  readonly paginatedQueue = computed(() => {
    const sorted = sortByStartTime(
      this.buildStatusService.waitingQueue(),
      this.buildStatusService.estimates().waitingStart,
    );
    const start = (this.currentPage() - 1) * WAITING_PAGE_SIZE;
    return sorted.slice(start, start + WAITING_PAGE_SIZE);
  });

  selectPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pageCount()));
  }
}

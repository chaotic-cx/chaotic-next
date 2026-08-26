import { Component, computed, inject, signal } from '@angular/core';
import { MessageToastService } from '@garudalinux/core';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AuthService } from 'ngx-better-auth';
import { FlipListDirective } from '../animations/flip-list.directive';
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { BuildStatusPager } from './build-status-pager.component';
import { BuildStatusSectionComponent } from './build-status-section.component';
import { BUILD_ESTIMATE_TOOLTIP, BuildStatusService } from './build-status.service';

const WAITING_PAGE_SIZE = 6;

@Component({
  selector: 'chaotic-build-status-waiting-builds',
  imports: [BuildStatusSectionComponent, BuildStatusPager, BuildClassPipe, Tooltip, FlipListDirective],
  templateUrl: './waiting-builds.component.html',
  styleUrl: './waiting-builds.component.css',
})
export class WaitingBuildsComponent {
  readonly buildStatusService = inject(BuildStatusService);
  private readonly authService = inject(AuthService);
  private readonly messageToastService = inject(MessageToastService);
  readonly estimateTooltip = BUILD_ESTIMATE_TOOLTIP;

  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly promoting = signal<string | null>(null);

  private readonly page = signal(1);

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.buildStatusService.waitingQueue().length / WAITING_PAGE_SIZE)),
  );

  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));

  readonly paginatedQueue = computed(() => {
    const queue = this.buildStatusService.waitingQueue();
    const start = (this.currentPage() - 1) * WAITING_PAGE_SIZE;
    return queue.slice(start, start + WAITING_PAGE_SIZE);
  });

  selectPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pageCount()));
  }

  async promote(pkgName: string, rawName: string, repo: string): Promise<void> {
    const pkgbase = rawName.split('/').pop() ?? pkgName;
    this.promoting.set(pkgName);
    try {
      await this.buildStatusService.promote(pkgbase, 'x86_64', repo);
      this.messageToastService.success('Build promoted', `${pkgName} has been promoted to the front of the queue.`);
      this.buildStatusService.refreshQueueStats();
    } catch {
      this.messageToastService.error('Promote failed', `Could not promote ${pkgName}.`);
    } finally {
      this.promoting.set(null);
    }
  }
}

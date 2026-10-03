import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AuthService } from 'ngx-better-auth';
import { FlipListDirective } from '../animations/flip-list.directive';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { BuildStatusPager } from './build-status-pager.component';
import { BuildStatusSectionComponent } from './build-status-section.component';
import { BuildStatusService } from './build-status.service';
import { paginateByStartTime } from './queue-estimates';

const WAITING_PAGE_SIZE = 8;
const SKELETON_ROW_COUNT = 4;

@Component({
  selector: 'chaotic-build-status-waiting-builds',
  imports: [
    LoadErrorComponent,
    BuildStatusSectionComponent,
    BuildStatusPager,
    BuildClassPipe,
    Tooltip,
    FlipListDirective,
    RouterLink,
    TranslocoDirective,
  ],
  templateUrl: './waiting-builds.component.html',
  styleUrl: './waiting-builds.component.css',
})
export class WaitingBuildsComponent {
  readonly buildStatusService = inject(BuildStatusService);
  private readonly authService = inject(AuthService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly transloco = inject(TranslocoService);

  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly skeletonRows = Array.from({ length: SKELETON_ROW_COUNT });
  readonly promoting = signal<string | null>(null);

  private readonly page = signal(1);

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.buildStatusService.waitingQueue().length / WAITING_PAGE_SIZE)),
  );

  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));

  readonly pageOffset = computed(() => (this.currentPage() - 1) * WAITING_PAGE_SIZE);

  readonly paginatedQueue = computed(() =>
    paginateByStartTime(
      this.buildStatusService.waitingQueue(),
      this.buildStatusService.estimates().waitingStart,
      this.currentPage(),
      WAITING_PAGE_SIZE,
    ),
  );

  readonly isBlocked = computed(
    () =>
      this.buildStatusService.waitingQueue().length > 0 && this.buildStatusService.estimates().waitingStart.size === 0,
  );

  selectPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pageCount()));
  }

  async promote(pkgName: string, rawName: string, repo: string): Promise<void> {
    const pkgbase = rawName.split('/').pop() ?? pkgName;
    this.promoting.set(pkgName);
    try {
      await this.buildStatusService.promote(pkgbase, 'x86_64', repo);
      this.messageToastService.success(
        this.transloco.translate('buildStatus.waiting.promoteSuccess.title'),
        this.transloco.translate('buildStatus.waiting.promoteSuccess.message', { name: pkgName }),
      );
      this.buildStatusService.refreshQueueStats();
    } catch {
      this.messageToastService.error(
        this.transloco.translate('buildStatus.waiting.promoteError.title'),
        this.transloco.translate('buildStatus.waiting.promoteError.message', { name: pkgName }),
      );
    } finally {
      this.promoting.set(null);
    }
  }
}

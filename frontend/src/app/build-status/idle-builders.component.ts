import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { BuildStatusSectionComponent } from './build-status-section.component';
import { BuildStatusService } from './build-status.service';

const SKELETON_CHIP_COUNT = 3;

@Component({
  selector: 'chaotic-build-status-idle-builders',
  imports: [LoadErrorComponent, BuildStatusSectionComponent, BuildClassPipe, TranslocoDirective, EmptyStateComponent],
  templateUrl: './idle-builders.component.html',
  styles: `
    .builder-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.75rem;
      border: 1px solid var(--chaotic-border);
      border-radius: var(--chaotic-radius-pill);
      font-size: 0.8125rem;
    }

    .builder-chip__dot {
      width: 0.4375rem;
      height: 0.4375rem;
      border-radius: var(--chaotic-radius-pill);
      background: var(--catppuccin-color-green);
    }
  `,
})
export class IdleBuildersComponent {
  readonly buildStatusService = inject(BuildStatusService);
  readonly skeletonChips = Array.from({ length: SKELETON_CHIP_COUNT });
}

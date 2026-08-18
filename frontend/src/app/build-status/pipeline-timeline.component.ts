import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Ripple } from '@openng/optimus-ui/ripple';
import { Skeleton } from '@openng/optimus-ui/skeleton';
import { Timeline } from '@openng/optimus-ui/timeline';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { castTo, range } from '../functions';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import type { PipelineView } from './build-status.service';

@Component({
  selector: 'chaotic-pipeline-timeline',
  imports: [CommonModule, Timeline, Skeleton, RouterLink, Tooltip, RelativeTimePipe, Ripple],
  templateUrl: './pipeline-timeline.component.html',
  styles: [
    `
      :host ::ng-deep .p-timeline-event-opposite {
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
      }
    `,
  ],
})
export class PipelineTimelineComponent {
  readonly pipelines = input<PipelineView[]>([]);
  readonly loading = input<boolean>(true);
  readonly skeletonCount = input<number>(22);

  readonly openPipeline = output<number>();

  readonly typed = castTo<PipelineView>;
  readonly createRange = range;
}

import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Timeline } from '@openng/optimus-ui/timeline';
import { Skeleton } from '@openng/optimus-ui/skeleton';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { castTo, range } from '../functions';
import type { PipelineView } from './build-status.service';

@Component({
  selector: 'chaotic-pipeline-timeline',
  imports: [CommonModule, Timeline, Skeleton, RouterLink, Tooltip],
  templateUrl: './pipeline-timeline.component.html',
})
export class PipelineTimelineComponent {
  readonly pipelines = input<PipelineView[]>([]);
  readonly loading = input<boolean>(true);
  readonly skeletonCount = input<number>(22);

  readonly openPipeline = output<number>();

  readonly typed = castTo<PipelineView>;
  readonly createRange = range;
}

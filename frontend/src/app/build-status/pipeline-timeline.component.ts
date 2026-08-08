import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { type PipelineWithExternalStatus } from '@./shared-lib';
import { Timeline } from '@openng/optimus-ui/timeline';
import { Skeleton } from '@openng/optimus-ui/skeleton';

@Component({
  selector: 'chaotic-pipeline-timeline',
  imports: [CommonModule, Timeline, Skeleton],
  templateUrl: './pipeline-timeline.component.html',
})
export class PipelineTimelineComponent {
  readonly pipelines = input<PipelineWithExternalStatus[]>([]);
  readonly loading = input<boolean>(true);
  readonly skeletonCount = input<number>(22);

  readonly openPipeline = output<number>();

  typed(value: any): PipelineWithExternalStatus {
    return value;
  }

  createRange(number: number): number[] {
    return new Array(number).fill(0).map((n, index) => index + 1);
  }
}

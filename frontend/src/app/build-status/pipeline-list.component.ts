import { LocaleDatePipe } from '../pipes/locale-date.pipe';
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Skeleton } from '@openng/optimus-ui/skeleton';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { range } from '../functions';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { FlipListDirective } from '../animations/flip-list.directive';
import type { PipelineView } from './build-status.service';

const STATUS_DOT_CLASS: Record<string, string> = {
  running: 'bg-ctp-peach',
  pending: 'bg-ctp-text',
  waiting_for_resource: 'bg-ctp-flamingo',
  canceling: 'bg-ctp-maroon',
  canceled: 'bg-ctp-text',
};

const FALLBACK_DOT_CLASS = 'bg-ctp-subtext0';

@Component({
  selector: 'chaotic-pipeline-list',
  imports: [RouterLink, Skeleton, Tooltip, RelativeTimePipe, LocaleDatePipe, FlipListDirective],
  templateUrl: './pipeline-list.component.html',
})
export class PipelineListComponent {
  readonly pipelines = input<PipelineView[]>([]);
  readonly loading = input<boolean>(true);
  readonly skeletonCount = input<number>(22);

  readonly openPipeline = output<number>();

  readonly createRange = range;

  /** Stagger caps the entry delay so long lists do not feel sluggish. */
  readonly STAGGER_CAP = 8;

  statusDotClass(status: string): string {
    if (status.includes('success')) return 'bg-ctp-green';
    if (status.includes('failed')) return 'bg-ctp-red';
    return STATUS_DOT_CLASS[status] ?? FALLBACK_DOT_CLASS;
  }
}

import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { FlipListDirective } from '../animations/flip-list.directive';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
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
  imports: [DatePipe, RouterLink, Tooltip, RelativeTimePipe, FlipListDirective],
  templateUrl: './pipeline-list.component.html',
})
export class PipelineListComponent {
  readonly pipelines = input<PipelineView[]>([]);
  readonly loading = input<boolean>(true);

  readonly openPipeline = output<number>();

  readonly STAGGER_CAP = 8;

  statusDotClass(status: string): string {
    if (status.includes('success')) return 'bg-ctp-green';
    if (status.includes('failed')) return 'bg-ctp-red';
    return STATUS_DOT_CLASS[status] ?? FALLBACK_DOT_CLASS;
  }
}

import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { FlipListDirective } from '../animations/flip-list.directive';
import { IsoDateTimePipe } from '../pipes/iso-date-time.pipe';
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
const SUCCESS_DOT_CLASS = 'bg-ctp-green';
const FAILED_DOT_CLASS = 'bg-ctp-red';

@Component({
  selector: 'chaotic-pipeline-list',
  imports: [DatePipe, RouterLink, Tooltip, IsoDateTimePipe, RelativeTimePipe, FlipListDirective, TranslocoDirective],
  templateUrl: './pipeline-list.component.html',
})
export class PipelineListComponent {
  readonly pipelines = input<PipelineView[]>([]);

  readonly openPipeline = output<number>();

  statusDotClass(view: PipelineView): string {
    if (view.failedJobs > 0) return FAILED_DOT_CLASS;

    if (view.status.includes('success')) return SUCCESS_DOT_CLASS;

    if (view.status.includes('failed')) return FAILED_DOT_CLASS;

    return STATUS_DOT_CLASS[view.status] ?? FALLBACK_DOT_CLASS;
  }
}

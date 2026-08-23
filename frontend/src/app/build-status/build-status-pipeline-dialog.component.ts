import { CommonModule } from '@angular/common';
import { Component, computed, input, model } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Dialog } from '@openng/optimus-ui/dialog';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { LocaleDatePipe } from '../pipes/locale-date.pipe';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import type { PipelineView } from './build-status.service';

interface JobStatus {
  icon: string;
  color: string;
  chip: string;
  rank: number;
}

const JOB_STATUS: Record<string, JobStatus> = {
  running: { icon: 'pi-spin pi-spinner', color: 'text-ctp-peach', chip: 'border-ctp-peach', rank: 0 },
  pending: { icon: 'pi-clock', color: 'text-ctp-yellow', chip: 'border-ctp-yellow', rank: 1 },
  waiting_for_resource: { icon: 'pi-hourglass', color: 'text-ctp-lavender', chip: 'border-ctp-lavender', rank: 1 },
  failed: { icon: 'pi-times-circle', color: 'text-ctp-red', chip: 'border-ctp-red', rank: 2 },
  canceled: { icon: 'pi-ban', color: 'text-ctp-subtext0', chip: 'border-ctp-subtext0', rank: 2 },
  success: { icon: 'pi-check-circle', color: 'text-ctp-green', chip: 'border-ctp-green', rank: 3 },
};

const UNKNOWN_STATUS: JobStatus = {
  icon: 'pi-question-circle',
  color: 'text-ctp-subtext0',
  chip: 'border-ctp-subtext0',
  rank: 3,
};

@Component({
  selector: 'chaotic-build-status-pipeline-dialog',
  imports: [CommonModule, RouterLink, Dialog, Tooltip, RelativeTimePipe, LocaleDatePipe],
  templateUrl: './build-status-pipeline-dialog.component.html',
  styleUrl: './build-status-pipeline-dialog.component.css',
})
export class BuildStatusPipelineDialogComponent {
  readonly data = input<PipelineView | null>(null);
  readonly visible = model(false);

  jobStatus(status: string): JobStatus {
    return JOB_STATUS[status] ?? UNKNOWN_STATUS;
  }

  /** Jobs ordered by lifecycle: in progress, waiting, failed/canceled, then done. */
  readonly sortedCommit = computed(() => {
    const jobs = this.data()?.commit ?? [];
    return [...jobs].sort((a, b) => this.jobStatus(a.status).rank - this.jobStatus(b.status).rank);
  });
}

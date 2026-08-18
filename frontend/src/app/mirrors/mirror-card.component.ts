import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import type { Mirror } from '@chaotic-next/shared-lib';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';

const STATUS = {
  online: {
    label: 'Online',
    chip: 'border-ctp-green text-ctp-green',
    tooltip: 'All up to date and fine',
  },
  outdated: {
    label: 'Outdated',
    chip: 'border-ctp-peach text-ctp-peach',
    tooltip: 'Geo- and country mirrors don\u2019t route to it, and direct requests will return an error code.',
  },
  offline: {
    label: 'Offline',
    chip: 'border-ctp-red text-ctp-red',
    tooltip: 'The up-to-date check is completely unsuccessful, so the mirror is considered offline.',
  },
} as const;

@Component({
  selector: 'chaotic-mirror-card',
  imports: [CommonModule, RelativeTimePipe, Tooltip],
  templateUrl: './mirror-card.component.html',
  styleUrl: './mirror-card.component.css',
})
export class MirrorCardComponent {
  readonly mirror = input.required<Mirror>();
  readonly status = input.required<keyof typeof STATUS>();

  readonly STATUS = STATUS;
}

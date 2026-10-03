import { Component, input } from '@angular/core';

export interface BarRow {
  label: string;
  /** Bar fill from 0 to 1. */
  share: number;
  detail: string;
}

@Component({
  selector: 'chaotic-admin-bar-list',
  template: `
    <ul class="bar-list">
      @for (row of rows(); track row.label) {
        <li class="bar-row">
          <span class="bar-label" [title]="row.label">{{ row.label }}</span>
          <span class="bar-track" aria-hidden="true">
            <span class="bar-fill" [style.width.%]="row.share * 100"></span>
          </span>
          <span class="bar-detail">{{ row.detail }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    .bar-list {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      padding: 0.5rem 1rem 0.75rem;
    }

    .bar-row {
      display: grid;
      grid-template-columns: minmax(0, 9rem) minmax(0, 1fr) 4.5rem;
      align-items: center;
      gap: 0.75rem;
      min-height: 2rem;
    }

    .bar-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
      font-size: 0.8125rem;
      color: var(--ctp-mocha-text);
    }

    .bar-track {
      height: 6px;
      overflow: hidden;
      border-radius: 9999px;
      background: color-mix(in srgb, var(--ctp-mocha-surface0) 70%, transparent);
    }

    .bar-fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: color-mix(in srgb, var(--ctp-mocha-mauve) 70%, transparent);
    }

    .bar-detail {
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
      text-align: right;
      color: var(--ctp-mocha-overlay1);
    }
  `,
})
export class AdminBarListComponent {
  readonly rows = input.required<BarRow[]>();
}

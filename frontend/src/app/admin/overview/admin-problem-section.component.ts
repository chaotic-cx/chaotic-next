import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface ProblemRow {
  name: string;
  detail: string;
}

@Component({
  selector: 'chaotic-admin-problem-section',
  imports: [RouterLink],
  template: `
    <div class="problem-head">
      <h3 class="problem-title">{{ title() }}</h3>
      <span class="problem-count" [class.is-zero]="count() === 0">{{ count() ?? '–' }}</span>
      @if (link(); as target) {
        <a class="chaotic-card__link" [routerLink]="target">{{ linkLabel() }}</a>
      }
    </div>
    @if (failed()) {
      <p class="problem-note">
        Could not load.
        <button class="problem-retry" (click)="retry.emit()" type="button">Try again</button>
      </p>
    } @else if (count() === 0) {
      <p class="problem-note">{{ emptyText() }}</p>
    } @else if (rows().length > 0) {
      <ul class="chaotic-mini-list problem-list">
        @for (row of rows(); track row.name) {
          <li>
            <span class="chaotic-mini-list__name">{{ row.name }}</span>
            <span class="chaotic-mini-list__meta" [title]="row.detail">{{ row.detail }}</span>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: block;
      padding-block: 0.75rem 0.25rem;
      border-bottom: 1px solid var(--chaotic-border);
    }

    :host(:last-child) {
      border-bottom: none;
    }

    .problem-head {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      padding-inline: 1rem;
    }

    .problem-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--ctp-mocha-text);
    }

    .problem-count {
      font-size: 0.8125rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--ctp-mocha-peach);
    }

    .problem-count.is-zero {
      color: var(--ctp-mocha-overlay1);
    }

    .problem-list {
      padding-block: 0.25rem 0;
    }

    .problem-note {
      padding: 0.375rem 1rem 0.5rem;
      font-size: 0.8125rem;
      color: var(--ctp-mocha-overlay1);
    }

    .problem-retry {
      margin-left: 0.25rem;
      color: var(--ctp-mocha-subtext1);
      text-decoration: underline;
      text-underline-offset: 0.2em;
      cursor: pointer;
    }

    .problem-retry:hover {
      color: var(--ctp-mocha-mauve);
    }
  `,
})
export class AdminProblemSectionComponent {
  readonly title = input.required<string>();
  readonly count = input<number | null>(null);
  readonly rows = input<ProblemRow[]>([]);
  readonly failed = input(false);
  readonly emptyText = input('Nothing to fix.');
  readonly link = input<string | null>(null);
  readonly linkLabel = input('Open');
  readonly retry = output();
}

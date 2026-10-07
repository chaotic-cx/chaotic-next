import { Component, input, output } from '@angular/core';
import { type DiffScanFinding, type DiffScanSeverity } from '@chaotic-next/shared-lib';
import { TranslocoDirective } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { Tooltip } from '@openng/optimus-ui/tooltip';

const SEVERITY_LABELS: Record<DiffScanSeverity, string> = {
  critical: marker('aurScan.severity.critical'),
  warning: marker('aurScan.severity.warning'),
  info: marker('aurScan.severity.info'),
};

@Component({
  selector: 'chaotic-scan-finding-row',
  imports: [Tooltip, TranslocoDirective],
  template: `
    <button
      class="finding"
      *transloco="let t"
      [class]="'finding--' + finding().severity"
      (click)="activate.emit()"
      type="button"
    >
      <span class="finding__severity">
        <span class="finding__dot" aria-hidden="true"></span>
        {{ t(severityLabels[finding().severity]) }}
      </span>
      <span class="finding__rule" [pTooltip]="finding().description" tooltipPosition="top">{{
        finding().ruleName
      }}</span>
      <code class="finding__location">{{ location() }}</code>
      <code class="finding__match">{{ finding().match }}</code>
    </button>
  `,
  styles: `
    :host {
      display: block;
    }

    .finding {
      display: grid;
      grid-template-columns: 5.5rem minmax(0, 1fr) auto;
      grid-template-areas:
        'severity rule location'
        '. match match';
      align-items: baseline;
      gap: 0.25rem 0.75rem;
      width: 100%;
      padding: 0.625rem 0.75rem;
      border-radius: var(--chaotic-radius-sm);
      text-align: left;
      cursor: pointer;
      transition: background-color var(--chaotic-duration-fast) var(--chaotic-ease-out);
    }

    .finding:hover,
    .finding:focus-visible {
      background: color-mix(in srgb, var(--catppuccin-color-surface0) 45%, transparent);
    }

    .finding__severity {
      grid-area: severity;
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.75rem;
      font-weight: var(--chaotic-weight-semibold);
      color: var(--finding-tone);
    }

    .finding__dot {
      width: 0.4375rem;
      height: 0.4375rem;
      border-radius: var(--chaotic-radius-pill);
      background: var(--finding-tone);
    }

    .finding__rule {
      grid-area: rule;
      min-width: 0;
      font-size: 0.875rem;
      font-weight: var(--chaotic-weight-semibold);
      color: var(--catppuccin-color-text);
    }

    .finding__location {
      grid-area: location;
      font-size: 0.75rem;
      color: var(--chaotic-ink-sky);
      white-space: nowrap;
    }

    .finding__match {
      grid-area: match;
      overflow-wrap: anywhere;
      font-size: 0.75rem;
      color: var(--chaotic-fg-muted);
    }

    .finding--critical {
      --finding-tone: var(--catppuccin-color-red);
    }

    .finding--warning {
      --finding-tone: var(--catppuccin-color-peach);
    }

    .finding--info {
      --finding-tone: var(--catppuccin-color-overlay2);
    }

    @media (max-width: 639px) {
      .finding {
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas:
          'severity location'
          'rule rule'
          'match match';
      }
    }
  `,
})
export class ScanFindingRowComponent {
  readonly finding = input.required<DiffScanFinding>();
  readonly location = input.required<string>();
  readonly activate = output();

  protected readonly severityLabels = SEVERITY_LABELS;
}

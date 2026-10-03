import { Component, computed, inject, input, signal } from '@angular/core';
import { MessageToastService } from '@garudalinux/core';
import { Highlight } from 'ngx-highlightjs';

const COPIED_RESET_MS = 1500;
const PROMPT_PREFIX = /^\$ /gm;

@Component({
  selector: 'chaotic-code-block',
  imports: [Highlight],
  template: `
    <div class="code-block">
      <pre><code [highlight]="code()" [language]="language()"></code></pre>
      <button
        class="chaotic-icon-btn"
        [attr.aria-label]="copied() ? copiedLabel() : 'Copy to clipboard'"
        (click)="copy()"
        type="button"
      >
        @if (copied()) {
          <svg class="copied-check" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8.5l3.25 3.25L13 5" />
          </svg>
        } @else {
          <i class="pi pi-copy" aria-hidden="true"></i>
        }
      </button>
      <span class="sr-only" role="status">{{ copied() ? copiedLabel() : '' }}</span>
    </div>
  `,
  styles: `
    .code-block {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.5rem 0.5rem 0.5rem 1rem;
      margin-block: 0.75rem;
      border-radius: var(--chaotic-radius-md);
      border: 1px solid var(--chaotic-border);
      background: color-mix(in srgb, var(--ctp-mocha-crust) 70%, transparent);
    }

    pre {
      flex: 1;
      min-width: 0;
      margin: 0;
      padding-block: 0.375rem;
      font-size: 0.875rem;
      line-height: 1.6;
    }

    .copied-check {
      width: 1rem;
      height: 1rem;
      fill: none;
      stroke: var(--ctp-mocha-green);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 16;
      animation: copied-check-draw 220ms ease-out both;
    }

    @keyframes copied-check-draw {
      from {
        stroke-dashoffset: 16;
      }
      to {
        stroke-dashoffset: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .copied-check {
        animation: none;
      }
    }

    pre code {
      display: block;
      overflow: visible !important;
      background: transparent !important;
      padding: 0 !important;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `,
})
export class CodeBlockComponent {
  private readonly messageToastService = inject(MessageToastService);

  readonly code = input.required<string>();
  readonly language = input('shell');

  protected readonly copied = signal(false);

  protected readonly copiedLabel = computed(() => {
    const lineCount = this.code()
      .split('\n')
      .filter((line) => line.trim() !== '').length;
    const noun = this.language() === 'shell' ? 'command' : 'line';
    return lineCount === 1 ? `Copied the ${noun}` : `Copied ${lineCount} ${noun}s`;
  });

  protected copy(): void {
    if (!navigator.clipboard) return;

    navigator.clipboard
      .writeText(this.code().replace(PROMPT_PREFIX, ''))
      .then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), COPIED_RESET_MS);
      })
      .catch((err) => {
        this.messageToastService.error('Copy failed', 'Failed copying to clipboard');
        console.error(err);
      });
  }
}

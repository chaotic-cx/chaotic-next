import { Component, computed, inject, input, signal } from '@angular/core';
import { MessageToastService } from '@garudalinux/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { Highlight } from 'ngx-highlightjs';
import { injectActiveTranslation } from '../i18n/active-translation';

const COPIED_RESET_MS = 1500;
const PROMPT_PREFIX = /^\$ /gm;
const SHELL_LANGUAGE = 'shell';

interface CopiedLabelKeys {
  one: string;
  other: string;
}

const COPIED_COMMAND_KEYS: CopiedLabelKeys = {
  one: marker('codeBlock.copiedCommandOne'),
  other: marker('codeBlock.copiedCommandOther'),
};

const COPIED_LINE_KEYS: CopiedLabelKeys = {
  one: marker('codeBlock.copiedLineOne'),
  other: marker('codeBlock.copiedLineOther'),
};

@Component({
  selector: 'chaotic-code-block',
  imports: [Highlight, TranslocoDirective],
  template: `
    <div class="code-block" *transloco="let t">
      <pre><code [highlight]="code()" [language]="language()"></code></pre>
      <button
        class="chaotic-icon-btn"
        [attr.aria-label]="copied() ? copiedLabel() : t('common.copyToClipboard')"
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
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly code = input.required<string>();
  readonly language = input(SHELL_LANGUAGE);

  protected readonly copied = signal(false);

  protected readonly copiedLabel = computed(() => {
    this.activeTranslation();

    const lineCount = this.code()
      .split('\n')
      .filter((line) => line.trim() !== '').length;
    const keys = this.language() === SHELL_LANGUAGE ? COPIED_COMMAND_KEYS : COPIED_LINE_KEYS;

    if (lineCount === 1) {
      return this.transloco.translate(keys.one);
    }

    return this.transloco.translate(keys.other, { count: lineCount });
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
        this.messageToastService.error(
          this.transloco.translate('common.copyFailed'),
          this.transloco.translate('common.failedCopyingToClipboard'),
        );
        console.error(err);
      });
  }
}

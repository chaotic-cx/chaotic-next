import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { backendErrorMessage, RequestFailure, requestFailure } from '../api-errors';
import { errorMessage } from '../functions';

const COPY_FEEDBACK_MS = 2000;

type CopyState = 'idle' | 'copied' | 'failed';

// Failures without a hint here (not found, rate limited) carry their own message from the caller.
const HINT_KEYS: Partial<Record<RequestFailure, string>> = {
  offline: marker('loadError.hints.offline'),
  unreachable: marker('loadError.hints.unreachable'),
  permission: marker('loadError.hints.permission'),
  server: marker('loadError.hints.server'),
};

const COPY_LABEL_KEYS: Record<CopyState, string> = {
  idle: marker('loadError.copyDetails'),
  copied: marker('loadError.copied'),
  failed: marker('common.copyFailed'),
};

/**
 * Failure kind for the hint. A missing or non-HTTP error gets no hint, unless the browser is offline.
 */
function hintFailure(error: unknown): RequestFailure | null {
  const failure = requestFailure(error);
  if (failure === 'offline' || error instanceof HttpErrorResponse) {
    return failure;
  }

  return null;
}

/**
 * Plain-text report of a failed request, for a bug report or a chat message.
 */
function errorDetails(error: unknown): string {
  const lines = [`Time: ${new Date().toISOString()}`, `Page: ${window.location.href}`];

  if (error instanceof HttpErrorResponse) {
    lines.push(`Request: ${error.url ?? ''}`);
    lines.push(`Status: ${error.status} ${error.statusText}`);
    lines.push(`Message: ${backendErrorMessage(error, error.message)}`);
  } else {
    lines.push(`Message: ${errorMessage(error)}`);
  }

  return lines.join('\n');
}

/**
 * Inline error state for a failed load. It says what failed, gives a hint
 * from the HTTP status when an error is given, and offers a retry. With an
 * error, it can also copy the details, and on 401/403 it links to the login.
 */
@Component({
  selector: 'chaotic-load-error',
  imports: [RouterLink, TranslocoDirective],
  template: `
    <div class="chaotic-card__empty flex-col text-center" *transloco="let t" role="alert">
      <p class="inline-flex items-center gap-2 text-ctp-text">
        <i class="pi pi-exclamation-circle text-ctp-red" aria-hidden="true"></i>
        {{ message() ?? t('loadError.defaultMessage') }}
      </p>
      @if (hintKey(); as key) {
        <p class="load-error__hint">{{ t(key) }}</p>
      }
      <div class="load-error__actions">
        @if (kind() === 'permission') {
          <a class="load-error__action" [queryParams]="{ returnUrl: router.url }" routerLink="/login">{{
            t('loadError.signIn')
          }}</a>
        }
        <button class="load-error__action" (click)="retry.emit()" type="button">{{ t('common.tryAgain') }}</button>
        @if (error() !== undefined) {
          <button class="load-error__copy" (click)="copyDetails()" type="button" aria-live="polite">
            {{ t(copyLabelKey()) }}
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .load-error__hint {
      max-width: 40rem;
      font-size: 0.8125rem;
      color: var(--chaotic-fg-muted);
    }

    .load-error__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
    }

    .load-error__action {
      padding: 0.25rem 0.625rem;
      border: 1px solid var(--chaotic-border);
      border-radius: var(--chaotic-radius-sm);
      font-size: 0.8125rem;
      font-weight: var(--chaotic-weight-semibold);
      color: var(--catppuccin-color-text);
      cursor: pointer;
      transition: border-color var(--chaotic-duration-fast) var(--chaotic-ease-out);
    }

    .load-error__action:hover,
    .load-error__action:focus-visible {
      border-color: var(--catppuccin-color-mauve);
    }

    .load-error__copy {
      font-size: 0.8125rem;
      color: var(--catppuccin-color-subtext1);
      text-decoration: underline;
      text-underline-offset: 0.2em;
      cursor: pointer;
    }

    .load-error__copy:hover,
    .load-error__copy:focus-visible {
      color: var(--catppuccin-color-mauve);
    }
  `,
})
export class LoadErrorComponent {
  protected readonly router = inject(Router);

  readonly message = input<string>();
  readonly error = input<unknown>(undefined);
  readonly retry = output();

  private readonly copyState = signal<CopyState>('idle');
  private copyResetTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly kind = computed(() => hintFailure(this.error()));

  protected readonly hintKey = computed(() => {
    const kind = this.kind();
    if (kind === null) {
      return null;
    }

    return HINT_KEYS[kind] ?? null;
  });

  protected readonly copyLabelKey = computed(() => COPY_LABEL_KEYS[this.copyState()]);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copyResetTimer));
  }

  protected async copyDetails(): Promise<void> {
    try {
      await navigator.clipboard.writeText(errorDetails(this.error()));
      this.showCopyState('copied');
    } catch {
      this.showCopyState('failed');
    }
  }

  private showCopyState(state: CopyState): void {
    this.copyState.set(state);
    clearTimeout(this.copyResetTimer);
    this.copyResetTimer = setTimeout(() => this.copyState.set('idle'), COPY_FEEDBACK_MS);
  }
}

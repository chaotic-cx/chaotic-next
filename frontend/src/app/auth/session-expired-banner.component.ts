import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core/message-toast';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Button } from '@openng/optimus-ui/button';
import { finalize } from 'rxjs/operators';
import { GitlabLoginService, loginFailedMessageKey } from './gitlab-login.service';
import { SessionExpiryService } from './session-expiry.service';

/**
 * App-wide notice with a sign-in action, shown once the signed-in session ended on the server.
 */
@Component({
  selector: 'chaotic-session-expired-banner',
  imports: [Button, TranslocoDirective],
  template: `
    <div *transloco="let t; prefix: 'auth.sessionExpired'" role="status">
      @if (sessionExpiry.expired()) {
        <div class="chaotic-connection-banner flex-wrap">
          <i class="pi pi-lock" aria-hidden="true"></i>
          {{ t('message') }}
          <p-button
            [label]="t('signIn')"
            [loading]="signingIn()"
            (onClick)="signIn()"
            severity="secondary"
            size="small"
          />
        </div>
      }
    </div>
  `,
})
export class SessionExpiredBannerComponent {
  private readonly gitlabLoginService = inject(GitlabLoginService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly sessionExpiry = inject(SessionExpiryService);
  protected readonly signingIn = signal(false);

  protected signIn(): void {
    this.signingIn.set(true);
    this.gitlabLoginService
      .login(this.router.url)
      .pipe(finalize(() => this.signingIn.set(false)))
      .subscribe({
        complete: () => void this.sessionExpiry.recheck(),
        error: (error: unknown) => {
          this.messageToastService.error(
            this.transloco.translate('auth.loginFailed.title'),
            this.transloco.translate(loginFailedMessageKey(error)),
          );
        },
      });
  }
}

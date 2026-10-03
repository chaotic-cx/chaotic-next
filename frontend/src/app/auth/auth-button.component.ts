import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Avatar } from '@openng/optimus-ui/avatar';
import { Button } from '@openng/optimus-ui/button';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AuthService } from 'ngx-better-auth';
import { finalize } from 'rxjs/operators';
import { DEFAULT_LOGIN_REDIRECT, GitlabLoginService } from './gitlab-login.service';

function initialsOf(name: string | null | undefined): string {
  return (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

@Component({
  selector: 'chaotic-auth-button',
  imports: [Button, RouterLink, Tooltip, Avatar, TranslocoDirective],
  templateUrl: './auth-button.component.html',
  styleUrl: './auth-button.component.css',
})
export class AuthButtonComponent {
  private readonly authService = inject(AuthService);
  private readonly gitlabLoginService = inject(GitlabLoginService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly transloco = inject(TranslocoService);

  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly isLoginLoading = signal(false);
  readonly isLogoutLoading = signal(false);
  readonly user = computed(() => this.authService.session()?.user ?? null);

  protected readonly avatarFailed = signal(false);

  protected readonly avatarUrl = computed(() => {
    const user = this.user();
    if (!user?.image || this.avatarFailed()) return undefined;
    return user.image;
  });

  protected readonly avatarLabel = computed(() => initialsOf(this.user()?.name));

  constructor() {
    effect(() => {
      this.user();
      this.avatarFailed.set(false);
    });
  }

  protected onAvatarError(): void {
    this.avatarFailed.set(true);
  }

  login(): void {
    this.isLoginLoading.set(true);
    this.gitlabLoginService
      .login(DEFAULT_LOGIN_REDIRECT)
      .pipe(finalize(() => this.isLoginLoading.set(false)))
      .subscribe({
        error: () => {
          this.messageToastService.error(
            this.transloco.translate('auth.loginFailed.title'),
            this.transloco.translate('auth.loginFailed.message'),
          );
        },
      });
  }

  logout(): void {
    this.isLogoutLoading.set(true);
    this.authService
      .signOut()
      .pipe(finalize(() => this.isLogoutLoading.set(false)))
      .subscribe({
        error: () => {
          this.messageToastService.error(
            this.transloco.translate('auth.logoutFailed.title'),
            this.transloco.translate('auth.logoutFailed.message'),
          );
        },
      });
  }
}

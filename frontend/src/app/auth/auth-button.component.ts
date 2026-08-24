import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { Avatar } from '@openng/optimus-ui/avatar';
import { Button } from '@openng/optimus-ui/button';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AuthService } from 'ngx-better-auth';
import { finalize } from 'rxjs/operators';
import { GitlabLoginService } from './gitlab-login.service';

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
  imports: [Button, RouterLink, Tooltip, Avatar],
  templateUrl: './auth-button.component.html',
  styleUrl: './auth-button.component.css',
})
export class AuthButtonComponent {
  private readonly authService = inject(AuthService);
  private readonly gitlabLoginService = inject(GitlabLoginService);
  private readonly messageToastService = inject(MessageToastService);

  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly isLoginLoading = signal(false);
  readonly isLogoutLoading = signal(false);
  readonly user = computed(() => this.authService.session()?.user ?? null);
  readonly gitlabProfileUrl = computed(() => {
    const user = this.user();
    if (!user) return 'https://gitlab.com';
    const rawUser = user as { webUrl?: string; name?: string };
    if (rawUser.webUrl) return rawUser.webUrl;
    return `https://gitlab.com/${user.name}`;
  });

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
      .login('/')
      .pipe(finalize(() => this.isLoginLoading.set(false)))
      .subscribe({
        error: () => {
          this.messageToastService.error('Login failed', 'Could not start the GitLab sign-in flow.');
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
          this.messageToastService.error('Logout failed', 'Could not sign out. Please try again.');
        },
      });
  }
}

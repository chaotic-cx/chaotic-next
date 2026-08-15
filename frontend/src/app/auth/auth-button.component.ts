import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { AuthService } from 'ngx-better-auth';
import { Button } from '@openng/optimus-ui/button';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { GitlabLoginService } from './gitlab-login.service';

@Component({
  selector: 'chaotic-auth-button',
  imports: [Button, RouterLink, Tooltip],
  templateUrl: './auth-button.component.html',
})
export class AuthButtonComponent {
  private readonly authService = inject(AuthService);
  private readonly gitlabLoginService = inject(GitlabLoginService);
  private readonly messageToastService = inject(MessageToastService);

  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly user = computed(() => this.authService.session()?.user ?? null);
  readonly gitlabProfileUrl = computed(() => {
    const user = this.user();
    if (!user) return 'https://gitlab.com';
    const rawUser = user as { webUrl?: string; name?: string };
    if (rawUser.webUrl) return rawUser.webUrl;
    return `https://gitlab.com/${user.name}`;
  });

  login(): void {
    this.gitlabLoginService.login(window.location.origin);
  }

  logout(): void {
    this.authService.signOut().subscribe({
      error: () => this.messageToastService.error('Logout failed', 'Could not sign out. Please try again.'),
    });
  }
}

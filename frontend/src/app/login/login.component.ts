import { NgOptimizedImage } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Button } from '@openng/optimus-ui/button';
import { AuthService } from 'ngx-better-auth';
import { DEFAULT_LOGIN_REDIRECT, GitlabLoginService } from '../auth/gitlab-login.service';

@Component({
  selector: 'chaotic-login',
  imports: [Button, NgOptimizedImage, TranslocoDirective],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly gitlabLoginService = inject(GitlabLoginService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly isLoading = signal(false);

  constructor() {
    if (this.authService.isLoggedIn()) {
      void this.router.navigateByUrl(this.returnUrl());
    }
  }

  login(): void {
    this.isLoading.set(true);
    this.gitlabLoginService.login(this.returnUrl()).subscribe({
      error: () => {
        this.isLoading.set(false);
        this.messageToastService.error(
          this.transloco.translate('auth.loginFailed.title'),
          this.transloco.translate('auth.loginFailed.message'),
        );
      },
    });
  }

  private returnUrl(): string {
    return this.route.snapshot.queryParamMap.get('returnUrl') ?? DEFAULT_LOGIN_REDIRECT;
  }
}

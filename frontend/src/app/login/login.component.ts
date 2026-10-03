import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Button } from '@openng/optimus-ui/button';
import { AuthService } from 'ngx-better-auth';
import { DEFAULT_LOGIN_REDIRECT, GitlabLoginService, loginFailedMessageKey } from '../auth/gitlab-login.service';
import { injectActiveTranslation } from '../i18n/active-translation';

@Component({
  selector: 'chaotic-login',
  imports: [Button, NgOptimizedImage, TranslocoDirective],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly gitlabLoginService = inject(GitlabLoginService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly activeTranslation = injectActiveTranslation();

  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly isLoading = signal(false);
  private readonly errorKey = signal<string | null>(null);

  protected readonly errorMessage = computed(() => {
    this.activeTranslation();

    const key = this.errorKey();
    if (key === null) {
      return null;
    }

    return this.transloco.translate(key);
  });

  constructor() {
    if (this.authService.isLoggedIn()) {
      void this.router.navigateByUrl(this.returnUrl());
    }
  }

  login(): void {
    this.isLoading.set(true);
    this.errorKey.set(null);

    this.gitlabLoginService.login(this.returnUrl()).subscribe({
      // The user can close the sign-in window without an error, so the button must become usable again.
      complete: () => this.isLoading.set(false),
      error: (error: unknown) => {
        this.isLoading.set(false);
        this.errorKey.set(loginFailedMessageKey(error));
      },
    });
  }

  private returnUrl(): string {
    return this.route.snapshot.queryParamMap.get('returnUrl') ?? DEFAULT_LOGIN_REDIRECT;
  }
}

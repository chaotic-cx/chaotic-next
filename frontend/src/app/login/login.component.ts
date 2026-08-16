import { Component, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { Button } from '@openng/optimus-ui/button';
import { AuthService } from 'ngx-better-auth';
import { GitlabLoginService } from '../auth/gitlab-login.service';

@Component({
  selector: 'chaotic-login',
  imports: [Button, NgOptimizedImage],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly gitlabLoginService = inject(GitlabLoginService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

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
        this.messageToastService.error('Login failed', 'Could not start the GitLab sign-in flow.');
      },
    });
  }

  private returnUrl(): string {
    return this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
  }
}

import { Component, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isLoggedIn = this.authService.isLoggedIn;

  constructor() {
    if (this.authService.isLoggedIn()) {
      void this.router.navigateByUrl(this.returnUrl());
    }
  }

  login(): void {
    this.gitlabLoginService.login(this.returnUrl());
  }

  private returnUrl(): string {
    return this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
  }
}
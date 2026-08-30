import { NgOptimizedImage } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BackendStatusService } from '../backend-status/backend-status.service';

@Component({
  selector: 'chaotic-backend-down',
  imports: [NgOptimizedImage],
  templateUrl: './backend-down.component.html',
})
export class BackendDownComponent {
  private readonly backendStatus = inject(BackendStatusService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';

    effect(() => {
      if (this.backendStatus.status() === 'ok') void this.router.navigateByUrl(returnUrl);
    });
  }
}

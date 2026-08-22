import { NgOptimizedImage } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';

    this.backendStatus.status$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((status) => {
      if (status === 'ok') void this.router.navigateByUrl(returnUrl);
    });
  }
}

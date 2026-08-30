import { effect, inject, Service, signal } from '@angular/core';
import { AppService } from '../app.service';

export type BackendStatus = 'unknown' | 'ok' | 'down';

@Service()
export class BackendStatusService {
  private readonly appService = inject(AppService);

  private readonly internalStatus = signal<BackendStatus>('unknown');
  readonly status = this.internalStatus.asReadonly();

  constructor() {
    effect(() => {
      if (!this.appService.sseSettled()) return;
      this.setStatus(this.appService.sseConnected() ? 'ok' : 'down');
    });
  }

  private setStatus(status: BackendStatus): void {
    if (this.internalStatus() === status) return;
    this.internalStatus.set(status);
  }
}

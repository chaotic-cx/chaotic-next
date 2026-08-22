import { effect, inject, Service, signal } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AppService } from '../app.service';

export type BackendStatus = 'unknown' | 'ok' | 'down';

@Service()
export class BackendStatusService {
  private readonly appService = inject(AppService);

  private readonly internalStatus = signal<BackendStatus>('unknown');
  readonly status = this.internalStatus.asReadonly();

  private readonly statusSubject = new BehaviorSubject<BackendStatus>('unknown');
  readonly status$: Observable<BackendStatus> = this.statusSubject.asObservable();

  constructor() {
    effect(() => {
      this.setStatus(this.appService.sseConnected() ? 'ok' : 'down');
    });
  }

  private setStatus(status: BackendStatus): void {
    if (this.internalStatus() === status) return;
    this.internalStatus.set(status);
    this.statusSubject.next(status);
  }
}

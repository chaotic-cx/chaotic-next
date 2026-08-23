import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject } from 'rxjs';
import { Service } from '@angular/core';

@Service()
export class LoadingService {
  private readonly loading$ = new BehaviorSubject<boolean>(false);
  private readonly pendingRequests = new Set<string>();

  readonly isLoading = toSignal(this.loading$);

  setLoading(loading: boolean, requestId: string): void {
    if (loading) {
      this.pendingRequests.add(requestId);
    } else {
      this.pendingRequests.delete(requestId);
    }
    this.loading$.next(this.pendingRequests.size > 0);
  }
}

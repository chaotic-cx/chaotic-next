import { Service, signal } from '@angular/core';

@Service()
export class LoadingService {
  private readonly pendingRequests = new Set<string>();

  readonly isLoading = signal(false);

  setLoading(loading: boolean, requestId: string): void {
    if (loading) {
      this.pendingRequests.add(requestId);
    } else {
      this.pendingRequests.delete(requestId);
    }
    this.isLoading.set(this.pendingRequests.size > 0);
  }
}

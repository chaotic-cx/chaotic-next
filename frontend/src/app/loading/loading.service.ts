import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({
  providedIn: 'root',
})
export class LoadingService {
  /**
   * Emits the current loading state
   */
  loading$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  /**
   * Signal that indicates if loading is in progress
   */
  isLoading = toSignal(this.loading$);

  /**
   * Contains in-progress loading requests
   */
  loadingMap: Map<string, boolean> = new Map<string, boolean>();

  /**
   * Sets the loadingSub property value based on the following:
   * - If loading is true, add the provided url to the loadingMap with a true value, set loadingSub value to true
   * - If loading is false, remove the loadingMap entry and only when the map is empty will we set loadingSub to false
   * This pattern ensures if there are multiple requests awaiting completion, we don't set loading to false before
   * other requests have completed. At the moment, this function is only called from the HttpInterceptorService
   * @param loading Contains the loading state to set
   * @param url The request URL associated with the loading state
   */
  setLoading(loading: boolean, url: string): void {
    if (!url) {
      throw new Error('The request URL must be provided to the LoadingService.setLoading function');
    }

    if (loading) {
      this.loadingMap.set(url, loading);
      this.loading$.next(true);
    } else if (!loading && this.loadingMap.has(url)) {
      this.loadingMap.delete(url);
    }
    if (this.loadingMap.size === 0) {
      this.loading$.next(false);
    }
  }
}

import { inject, Service } from '@angular/core';
import { APP_CONFIG } from '../../environments/app-config.token';

@Service()
export class PackageLogService {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;

  /** EventSource URL of a build log; `offset` resumes a dropped stream.
   * `ngsw-bypass` keeps the ServiceWorker from intercepting the same-origin
   * stream (mirroring the /sse and job-trace endpoints). */
  getLogUrl(pkgname: string, timestamp: string, offset = 0): string {
    const base = `${this.backendUrl}/logs/${encodeURIComponent(pkgname)}/${encodeURIComponent(timestamp)}`;
    const params = new URLSearchParams({ 'ngsw-bypass': '' });
    if (offset > 0) params.set('offset', String(offset));
    return `${base}?${params.toString()}`;
  }
}

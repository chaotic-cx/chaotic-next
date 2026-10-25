import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { type Observable } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';

@Service()
export class PackageLogService {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private readonly http = inject(HttpClient);

  /** EventSource URL of a build log; `offset` resumes a dropped stream.
   * `ngsw-bypass` keeps the ServiceWorker from intercepting the same-origin
   * stream (mirroring the /sse and job-trace endpoints). */
  getLogUrl(pkgname: string, timestamp: string, offset = 0): string {
    const base = `${this.backendUrl}/logs/${encodeURIComponent(pkgname)}/${encodeURIComponent(timestamp)}`;
    const params = new URLSearchParams({ 'ngsw-bypass': '' });
    if (offset > 0) {
      params.set('offset', String(offset));
    }

    return `${base}?${params.toString()}`;
  }

  getStoredLogUrl(buildId: number): string {
    return `${this.backendUrl}/builder/builds/${buildId}/log`;
  }

  getStoredLog(buildId: number): Observable<string> {
    return this.http.get(this.getStoredLogUrl(buildId), { responseType: 'text' });
  }
}

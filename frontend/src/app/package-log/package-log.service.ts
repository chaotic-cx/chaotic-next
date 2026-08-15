import { inject, Service } from '@angular/core';
import { APP_CONFIG } from '../../environments/app-config.token';

@Service()
export class PackageLogService {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;

  /** URL for the raw (ANSI) build log of a package, proxied through the backend. */
  getLogUrl(pkgname: string, timestamp: string): string {
    return `${this.backendUrl}/logs/${encodeURIComponent(pkgname)}/${encodeURIComponent(timestamp)}`;
  }
}

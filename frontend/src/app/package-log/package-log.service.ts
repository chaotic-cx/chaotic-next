import { inject, Service } from '@angular/core';
import { APP_CONFIG } from '../../environments/app-config.token';

@Service()
export class PackageLogService {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;

  getLogUrl(pkgname: string, timestamp: string): string {
    return `${this.backendUrl}/logs/${encodeURIComponent(pkgname)}/${encodeURIComponent(timestamp)}`;
  }
}

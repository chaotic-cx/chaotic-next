import { inject, Service } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';

@Service()
export class UpdateService {
  private readonly updates = inject(SwUpdate);

  constructor() {
    this.updates.versionUpdates.pipe(takeUntilDestroyed()).subscribe((evt) => {
      switch (evt.type) {
        case 'VERSION_DETECTED':
          console.log(`Downloading new app version: ${evt.version.hash}`);
          break;
        case 'VERSION_READY':
          console.log(`Current app version: ${evt.currentVersion.hash}`);
          console.log(`New app version ready for use: ${evt.latestVersion.hash}`);
          void this.updates.activateUpdate();
          break;
        case 'VERSION_INSTALLATION_FAILED':
          console.log(`Failed to install app version '${evt.version.hash}': ${evt.error}`);
          break;
        case 'NO_NEW_VERSION_DETECTED':
          console.log('No new version detected.');
          break;
      }
    });
  }
}

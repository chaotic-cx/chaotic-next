import { ApplicationRef, inject, Injectable, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { MessageToastService } from '@garudalinux/core';

@Injectable({ providedIn: 'root' })
export class UpdateService {
  hasUpdate = signal<boolean>(false);

  private readonly appRef = inject(ApplicationRef);
  private readonly messageService = inject(MessageToastService);
  private readonly updates = inject(SwUpdate);

  constructor() {
    this.updates.versionUpdates.subscribe((evt) => {
      switch (evt.type) {
        case 'VERSION_DETECTED':
          console.log(`Downloading new app version: ${evt.version.hash}`);
          break;
        case 'VERSION_READY':
          console.log(`Current app version: ${evt.currentVersion.hash}`);
          console.log(`New app version ready for use: ${evt.latestVersion.hash}`);
          this.hasUpdate.set(true);
          break;
        case 'VERSION_INSTALLATION_FAILED':
          console.log(`Failed to install app version '${evt.version.hash}': ${evt.error}`);
          break;
        case 'VERSION_FAILED':
          console.log(`Version '${evt.version.hash}' failed with error: ${evt.error}`);
          break;
        case 'NO_NEW_VERSION_DETECTED':
          console.log('No new version detected.');
          break;
      }
    });
  }
}

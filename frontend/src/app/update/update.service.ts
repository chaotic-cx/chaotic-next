import { inject, Service } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MessageToastService } from '@garudalinux/core';
import { SwUpdate } from '@angular/service-worker';

const UPDATE_TOAST_LIFE_MS = 20000;

@Service()
export class UpdateService {
  private readonly updates = inject(SwUpdate);
  private readonly messageToastService = inject(MessageToastService);

  constructor() {
    this.updates.versionUpdates.pipe(takeUntilDestroyed()).subscribe((evt) => {
      switch (evt.type) {
        case 'VERSION_READY':
          void this.updates.activateUpdate();
          this.messageToastService.info('App updated', 'A new version is ready. Reload to use it.', 'top-center', {
            life: UPDATE_TOAST_LIFE_MS,
            closable: true,
          });
          break;
        case 'VERSION_INSTALLATION_FAILED':
          this.messageToastService.error('Update failed', `Could not install the new version: ${evt.error}`);
          break;
      }
    });
  }
}

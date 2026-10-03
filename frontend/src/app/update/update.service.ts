import { inject, Service } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { MessageToastService } from '@garudalinux/core';
import { TranslocoService } from '@jsverse/transloco';

const UPDATE_TOAST_LIFE_MS = 20000;

@Service()
export class UpdateService {
  private readonly updates = inject(SwUpdate);
  private readonly messageToastService = inject(MessageToastService);
  private readonly transloco = inject(TranslocoService);

  constructor() {
    this.updates.versionUpdates.pipe(takeUntilDestroyed()).subscribe((evt) => {
      switch (evt.type) {
        case 'VERSION_READY':
          void this.updates.activateUpdate();
          this.messageToastService.info(
            this.transloco.translate('update.ready.title'),
            this.transloco.translate('update.ready.message'),
            'top-center',
            {
              life: UPDATE_TOAST_LIFE_MS,
              closable: true,
            },
          );
          break;
        case 'VERSION_INSTALLATION_FAILED':
          console.error('Failed to install the new app version', evt.error);
          this.messageToastService.error(
            this.transloco.translate('update.failed.title'),
            this.transloco.translate('update.failed.message'),
          );
          break;
      }
    });
  }
}

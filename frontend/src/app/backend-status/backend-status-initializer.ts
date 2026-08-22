import { inject, provideAppInitializer } from '@angular/core';
import { BackendStatusService } from './backend-status.service';

export function provideBackendStatusInitializer() {
  return provideAppInitializer(() => {
    inject(BackendStatusService);
  });
}

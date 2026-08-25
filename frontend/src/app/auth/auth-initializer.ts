import { inject, provideAppInitializer } from '@angular/core';
import { AuthService } from 'ngx-better-auth';

export function provideAuthInitializer() {
  return provideAppInitializer(() => {
    inject(AuthService);
  });
}

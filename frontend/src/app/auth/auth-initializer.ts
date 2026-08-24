import { inject, provideAppInitializer } from '@angular/core';
import { AuthService } from 'ngx-better-auth';
import { firstValueFrom, race, timer } from 'rxjs';

const AUTH_INIT_TIMEOUT_MS = 500;

export function provideAuthInitializer() {
  return provideAppInitializer(() => {
    const authService = inject(AuthService);
    return firstValueFrom(race(authService.sessionState$, timer(AUTH_INIT_TIMEOUT_MS)));
  });
}

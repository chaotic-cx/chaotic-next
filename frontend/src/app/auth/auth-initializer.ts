import { inject, provideAppInitializer } from '@angular/core';
import { AuthService } from 'ngx-better-auth';
import { firstValueFrom } from 'rxjs';

export function provideAuthInitializer() {
  return provideAppInitializer(() => {
    const authService = inject(AuthService);
    return firstValueFrom(authService.sessionState$);
  });
}

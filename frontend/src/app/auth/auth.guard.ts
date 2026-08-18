import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from 'ngx-better-auth';
import { map, take } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.sessionState$.pipe(
    take(1),
    map((session) => (session ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: router.url } }))),
  );
};

import { inject } from '@angular/core';
import {
  type ActivatedRouteSnapshot,
  type CanActivateChildFn,
  type CanActivateFn,
  Router,
  type RouterStateSnapshot,
  type UrlTree,
} from '@angular/router';
import { map, type Observable, take } from 'rxjs';
import { BackendStatusService } from './backend-status.service';

function check(
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): boolean | UrlTree | Observable<boolean | UrlTree> {
  const statusService = inject(BackendStatusService);
  const router = inject(Router);

  if (statusService.status() === 'ok') return true;
  if (statusService.status() === 'down') {
    if (state.url.startsWith('/backend-down')) return true;
    return router.createUrlTree(['/backend-down'], { queryParams: { returnUrl: state.url } });
  }

  return statusService.status$.pipe(
    take(1),
    map((status) => {
      if (status === 'ok') return true;
      if (state.url.startsWith('/backend-down')) return true;
      return router.createUrlTree(['/backend-down'], { queryParams: { returnUrl: state.url } });
    }),
  );
}

export const backendGuard: CanActivateFn = check;
export const backendChildGuard: CanActivateChildFn = check;

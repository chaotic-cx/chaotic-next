import { inject } from '@angular/core';
import {
  type ActivatedRouteSnapshot,
  type CanActivateChildFn,
  type CanActivateFn,
  Router,
  type RouterStateSnapshot,
  type UrlTree,
} from '@angular/router';
import { BackendStatusService } from './backend-status.service';

function check(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
  const statusService = inject(BackendStatusService);
  const router = inject(Router);

  if (statusService.status() === 'down') {
    if (state.url.startsWith('/backend-down')) return true;
    return router.createUrlTree(['/backend-down'], { queryParams: { returnUrl: state.url } });
  }
  return true;
}

export const backendGuard: CanActivateFn = check;
export const backendChildGuard: CanActivateChildFn = check;

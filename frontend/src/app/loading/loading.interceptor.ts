import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { APP_CONFIG } from '../../environments/app-config.token';
import { LoadingService } from './loading.service';

@Injectable()
export class HttpRequestInterceptor implements HttpInterceptor {
  private readonly loading = inject(LoadingService);
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private counter = 0;

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const requestId = `${request.url}#${++this.counter}`;
    this.loading.setLoading(true, requestId);
    const forwarded = request.url.startsWith(this.backendUrl) ? request.clone({ withCredentials: true }) : request;
    return next.handle(forwarded).pipe(finalize(() => this.loading.setLoading(false, requestId)));
  }
}

import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { LoadingService } from './loading.service';

@Injectable()
export class HttpRequestInterceptor implements HttpInterceptor {
  private readonly loading = inject(LoadingService);
  private counter = 0;

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const requestId = `${request.url}#${++this.counter}`;
    this.loading.setLoading(true, requestId);
    return next.handle(request).pipe(finalize(() => this.loading.setLoading(false, requestId)));
  }
}

import { inject, Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { LoadingService } from './loading.service';

@Injectable()
export class HttpRequestInterceptor implements HttpInterceptor {
  private readonly loading = inject(LoadingService);
  private counter = 0;

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const requestId = `${request.url}#${++this.counter}`;
    this.loading.setLoading(true, requestId);
    return next
      .handle(request)
      .pipe(
        catchError((err) => {
          this.loading.setLoading(false, requestId);
          return throwError(() => err);
        }),
      )
      .pipe(
        map((evt: HttpEvent<unknown>) => {
          if (evt instanceof HttpResponse) {
            this.loading.setLoading(false, requestId);
          }
          return evt;
        }),
      );
  }
}

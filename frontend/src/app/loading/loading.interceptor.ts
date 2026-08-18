import { inject, Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { LoadingService } from './loading.service';

@Injectable()
export class HttpRequestInterceptor implements HttpInterceptor {
  private readonly loading = inject(LoadingService);

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    this.loading.setLoading(true, request.url);
    return next
      .handle(request)
      .pipe(
        catchError((err) => {
          this.loading.setLoading(false, request.url);
          return throwError(() => err);
        }),
      )
      .pipe(
        map((evt: HttpEvent<unknown>) => {
          if (evt instanceof HttpResponse) {
            this.loading.setLoading(false, request.url);
          }
          return evt;
        }),
      );
  }
}

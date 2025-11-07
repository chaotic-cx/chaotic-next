import { inject, Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { LoadingService } from './loading.service';

/**
 * This class is for intercepting http requests. When a request starts, we set the loadingSub property
 * in the LoadingService to true. Once the request completes, and we have a response, set the loadingSub
 * property to false. If an error occurs while servicing the request, set the loadingSub property to false.
 */
@Injectable()
export class HttpRequestInterceptor implements HttpInterceptor {
  private readonly loading = inject(LoadingService);

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
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
        map((evt: HttpEvent<any>) => {
          if (evt instanceof HttpResponse) {
            this.loading.setLoading(false, request.url);
          }
          return evt;
        }),
      );
  }
}

import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideAnimations(), provideHttpClient(withInterceptorsFromDi()), provideRouter(routes)],
};

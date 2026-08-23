import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

declare global {
  interface Window {
    chaoticAppBooted?: boolean;
  }
}

bootstrapApplication(AppComponent, appConfig)
  .then(() => {
    window.chaoticAppBooted = true;
  })
  .catch((err: unknown) => console.error(err));

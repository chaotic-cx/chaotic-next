import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { Card } from '@openng/optimus-ui/card';
import { AppService } from '../app.service';

// The app service reports this when the version request fails.
const UNKNOWN_VERSION = 'unknown';

@Component({
  selector: 'chaotic-footer',
  imports: [Card, RouterLink, TranslocoDirective],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css',
})
export class FooterComponent {
  private readonly appService = inject(AppService);
  currentYear = new Date().getFullYear();

  // An unknown version links to no release, so the footer leaves it out.
  protected readonly version = computed(() => {
    const version = this.appService.backendVersion();
    if (version === UNKNOWN_VERSION) {
      return undefined;
    }

    return version;
  });
}

import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Tab, TabList, Tabs } from '@openng/optimus-ui/tabs';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { setPageSeo } from '../functions';
import { TitleComponent } from '../title/title.component';
import { isAdminTab } from './admin-tabs';

@Component({
  selector: 'chaotic-admin',
  imports: [RouterOutlet, Tab, TabList, Tabs, TitleComponent, Tooltip],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css',
})
export class AdminComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly routerEvents = toSignal(this.router.events, { initialValue: null });

  protected readonly activeTab = computed<string>(() => {
    void this.routerEvents();
    return this.route.firstChild?.snapshot?.url?.[0]?.path ?? 'packages';
  });

  constructor() {
    setPageSeo(
      'Admin · Chaotic-AUR',
      'Administrative tools for the Chaotic-AUR backend',
      'Chaotic-AUR, Admin, Repository, Packages, Builders, Archlinux',
    );
  }

  protected navigate(value: string | number | undefined): void {
    if (typeof value === 'string' && isAdminTab(value)) {
      void this.router.navigate([value], {
        relativeTo: this.route,
      });
    }
  }
}

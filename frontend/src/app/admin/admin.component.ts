import { Component, computed, inject, OnInit } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Tab, TabList, Tabs } from '@openng/optimus-ui/tabs';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AppService } from '../app.service';
import { TitleComponent } from '../title/title.component';
import { isAdminTab } from './admin-tabs';

@Component({
  selector: 'chaotic-admin',
  imports: [RouterOutlet, Tab, TabList, Tabs, TitleComponent, Tooltip],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css',
})
export class AdminComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly routerEvents = toSignal(this.router.events, { initialValue: null });

  protected readonly activeTab = computed<string>(() => {
    void this.routerEvents();
    return this.route.firstChild?.snapshot?.url?.[0]?.path ?? 'packages';
  });

  ngOnInit(): void {
    this.appService.updateSeoTags(this.meta, {
      title: 'Admin',
      description: 'Administrative tools for the Chaotic-AUR backend',
      keywords: 'Chaotic-AUR, Admin, Repository, Packages, Builders, Archlinux',
      url: this.router.url,
    });
  }

  protected navigate(value: string | number | undefined): void {
    if (typeof value === 'string' && isAdminTab(value)) {
      void this.router.navigate([value], {
        relativeTo: this.route,
        info: { disableViewTransition: true },
      });
    }
  }
}

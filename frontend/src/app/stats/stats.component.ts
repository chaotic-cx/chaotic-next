import { httpResource } from '@angular/common/http';
import { ChangeDetectorRef, Component, computed, effect, inject, input, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { Select } from '@openng/optimus-ui/select';
import { Tab, TabList, Tabs } from '@openng/optimus-ui/tabs';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AppService } from '../app.service';
import { resourceValue } from '../functions';
import { TitleComponent } from '../title/title.component';
import { isStatsTab, StatsService } from './stats.service';

@Component({
  selector: 'chaotic-stats',
  imports: [TabList, Tabs, Tab, FormsModule, Select, TitleComponent, Tooltip, RouterOutlet],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css',
})
export class StatsComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly statsService = inject(StatsService);

  readonly search = input<string>();

  private readonly usersResource = httpResource<number>(() =>
    this.appService.getUsersResourceRequest(this.statsService.timeRangeDays() ?? undefined),
  );

  private readonly routerEvents = toSignal(this.router.events, { initialValue: null });

  protected readonly activeTab = computed<string>(() => {
    void this.routerEvents();
    return this.route.firstChild?.snapshot?.url?.[0]?.path ?? 'search';
  });

  constructor() {
    effect(() => {
      const users = resourceValue(this.usersResource);
      this.statsService.usersLoading.set(this.usersResource.isLoading());
      this.statsService.totalUsers.set(users ?? null);
      this.cdr.markForCheck();
    });

    // When arriving with a ?search= package name, always show the Search tab
    // so the package detail is actually visible.
    effect(() => {
      const q = this.search();
      if (typeof q === 'string' && q.trim()) {
        void this.router.navigate(['search'], {
          relativeTo: this.route,
          replaceUrl: true,
          queryParamsHandling: 'merge',
          info: { disableViewTransition: true },
        });
        this.cdr.markForCheck();
      }
    });
  }

  readonly subtitle = 'Area for package statistics and other fun stuff.';

  ngOnInit(): void {
    this.appService.updateSeoTags(this.meta, {
      title: 'Statistics and data',
      description: 'Package and repository statistics for Chaotic-AUR',
      keywords:
        'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR package statistics',
      url: this.router.url,
    });

    // Legacy deep links used fragments (#builder-stats); forward them to the
    // corresponding child route once.
    const fragment = this.route.snapshot.fragment;
    if (fragment !== null && isStatsTab(fragment)) {
      void this.router.navigate([fragment], {
        relativeTo: this.route,
        replaceUrl: true,
        info: { disableViewTransition: true },
      });
    }
  }

  protected navigate(value: string | number | undefined): void {
    if (typeof value === 'string' && isStatsTab(value)) {
      void this.router.navigate([value], {
        relativeTo: this.route,
        info: { disableViewTransition: true },
      });
    }
  }
}

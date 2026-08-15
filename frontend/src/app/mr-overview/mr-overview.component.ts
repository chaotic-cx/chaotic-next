import { MergeRequestWithDiffs } from '@chaotic-next/shared-lib';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, OnInit, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Button } from '@openng/optimus-ui/button';
import { Fieldset } from '@openng/optimus-ui/fieldset';
import { Panel } from '@openng/optimus-ui/panel';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { TableModule } from '@openng/optimus-ui/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from '@openng/optimus-ui/tabs';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AuthService } from 'ngx-better-auth';
import { filter } from 'rxjs';
import { AppService } from '../app.service';
import { DiffRendererComponent } from '../diff-renderer/diff-renderer.component';
import { TitleComponent } from '../title/title.component';
import { MrOverviewService } from './mr-overview.service';

@Component({
  selector: 'chaotic-mr-overview',
  imports: [
    TitleComponent,
    TableModule,
    DiffRendererComponent,
    ProgressSpinner,
    Panel,
    Fieldset,
    Button,
    NgTemplateOutlet,
    Tooltip,
    RouterLink,
    Tab,
    TabList,
    TabPanel,
    TabPanels,
    Tabs,
  ],
  templateUrl: './mr-overview.component.html',
  styleUrl: './mr-overview.component.css',
})
export class MrOverviewComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);

  protected readonly mrOverviewService = inject(MrOverviewService);

  private readonly authService = inject(AuthService);

  readonly isLoggedIn = this.authService.isLoggedIn;

  protected readonly nvcheckerMrs = computed(() =>
    this.mrOverviewService.mergeRequests().filter((mr) => mr.labels.includes('nvchecker')),
  );
  protected readonly packageMrs = computed(() =>
    this.mrOverviewService.mergeRequests().filter((mr) => !mr.labels.includes('nvchecker')),
  );

  constructor() {
    this.appService.chaoticEvent
      .pipe(
        filter((event) => event.type === 'merge_request'),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        // We just update the existing MRs with the new data, preserving scroll position
        const currentMrs = untracked(this.mrOverviewService.mergeRequests);
        const updatedMrs = currentMrs.map((currentMr) => {
          const updatedMr = event.mr.find((mr) => mr.id === currentMr.id);
          if (updatedMr) {
            return {
              ...currentMr,
              ...updatedMr,
              title: this.mrOverviewService.extractPkgName(updatedMr.title) || updatedMr.title,
              diffs: this.mrOverviewService.sortDiff(updatedMr.diffs),
            };
          }
          return currentMr;
        });

        this.mrOverviewService.mergeRequests.set(updatedMrs);
      });
  }

  ngOnInit() {
    this.appService.updateSeoTags(this.meta, {
      title: 'Update review',
      description: 'Review and approve pending merge requests for Chaotic-AUR',
      keywords:
        'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR update review',
      url: this.router.url,
    });

    void this.mrOverviewService.loadOpenMrs();
  }

  isLoading(mr: MergeRequestWithDiffs, action: 'approve' | 'flag:dangerous' | 'flag:hold' | 'any'): boolean {
    const loadingMap = this.mrOverviewService.loadingMap();
    if (action === 'any') {
      return (
        loadingMap.get(`${mr.iid}:approve`) === true ||
        loadingMap.get(`${mr.iid}:flag:dangerous`) === true ||
        loadingMap.get(`${mr.iid}:flag:hold`) === true
      );
    }
    const key = `${mr.iid}:${action}`;
    return loadingMap.get(key) === true;
  }
}

import { MergeRequestWithDiffs } from '@./shared-lib';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, OnInit, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { AutoFocus } from '@openng/optimus-ui/autofocus';
import { Button } from '@openng/optimus-ui/button';
import { Fieldset } from '@openng/optimus-ui/fieldset';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Panel } from '@openng/optimus-ui/panel';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { SelectButton } from '@openng/optimus-ui/selectbutton';
import { TableModule } from '@openng/optimus-ui/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from '@openng/optimus-ui/tabs';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { filter } from 'rxjs';
import { AppService } from '../app.service';
import { DiffRendererComponent } from '../diff-renderer/diff-renderer.component';
import { decrypt } from '../functions';
import { NotificationService } from '../notification/notification.service';
import { TitleComponent } from '../title/title.component';
import { MrOverviewService } from './mr-overview.service';

@Component({
  selector: 'chaotic-mr-overview',
  imports: [
    TitleComponent,
    TableModule,
    DiffRendererComponent,
    FormsModule,
    InputText,
    ProgressSpinner,
    AutoFocus,
    SelectButton,
    Panel,
    Fieldset,
    Button,
    NgTemplateOutlet,
    Tooltip,
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
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly mrOverviewService = inject(MrOverviewService);
  protected readonly storages: { label: string; value: string }[] = [
    { label: 'Forget after closing tab', value: 'sessionStorage' },
    { label: 'Persist after closing tab', value: 'localStorage' },
  ];

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
    this.appService.updateSeoTags(
      this.meta,
      'Update review',
      'Review and approve pending merge requests for Chaotic-AUR',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR update review',
      this.router.url,
    );

    let tokenFromStorage: string | null;
    tokenFromStorage = sessionStorage.getItem('gitlabPrivateToken');
    if (!tokenFromStorage) {
      tokenFromStorage = localStorage.getItem('gitlabPrivateToken');
    }

    if (tokenFromStorage) {
      decrypt(tokenFromStorage, 'thisaintrealsafety1!!1!').then((decryptedToken) => {
        this.mrOverviewService.token.set(decryptedToken);
      });
    }
    void this.mrOverviewService.loadOpenMrs();
  }

  /**
   * Checks if the approval process is ongoing for a given merge request.
   * @param mr The merge request to check.
   * @param type The type of action ('approve' or 'flag').
   * @returns True if the approval process is ongoing, false otherwise.
   */
  isLoading(mr: MergeRequestWithDiffs, type: 'approve' | 'flag'): boolean {
    const loadingMap = this.mrOverviewService.loadingMap();
    const identifier = type === 'approve' ? mr.iid : -mr.iid;
    return loadingMap.has(identifier) && loadingMap.get(identifier) === true;
  }

  /**
   * Sets the GitLab private token in session storage and refreshes the merge requests.
   * @param value The GitLab private token to be saved.
   */
  async setToken(value: string) {
    if (!value || value.trim().length === 0) {
      this.messageToastService.error('Invalid Token', 'Please provide a valid GitLab private token.');
      return;
    }

    const isValid = await this.mrOverviewService.testTokenWrite(value);
    if (!isValid) {
      this.messageToastService.error(
        'Invalid Token',
        'The provided GitLab private token is invalid or lacks necessary permissions.',
      );
      return;
    }

    // In this case, we might want to be notified about new merge requests
    const permission = await this.notificationService.requestPermission();
    const isSubscribed = localStorage.getItem('notifications-subscribed') === 'true';
    if (permission && !isSubscribed) {
      await this.notificationService.subscribeToNotifications();
    }

    this.mrOverviewService.token.set(value);
    this.messageToastService.success('Token Saved', 'GitLab private token has been saved to session storage.');
  }
}

import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { TitleComponent } from '../title/title.component';
import { TableModule } from 'primeng/table';
import { DiffRendererComponent } from '../diff-renderer/diff-renderer.component';
import { MessageToastService } from '@garudalinux/core';
import { FormsModule } from '@angular/forms';
import { InputText } from 'primeng/inputtext';
import { ProgressSpinner } from 'primeng/progressspinner';
import { MrOverviewService } from './mr-overview.service';
import { AutoFocus } from 'primeng/autofocus';
import { SelectButton } from 'primeng/selectbutton';
import { decrypt } from '../functions';
import { Panel } from 'primeng/panel';
import { AppService } from '../app.service';
import { Router } from '@angular/router';
import { Meta } from '@angular/platform-browser';
import { Fieldset } from 'primeng/fieldset';
import { Button } from 'primeng/button';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { MergeRequestWithDiffs } from '@./shared-lib';
import { NotificationService } from '../notification/notification.service';
import { NgClass } from '@angular/common';

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
    Button,
    NgClass,
  ],
  templateUrl: './mr-overview.component.html',
  styleUrl: './mr-overview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MrOverviewComponent implements OnInit {
  protected readonly mrOverviewService = inject(MrOverviewService);
  protected readonly storages: { label: string; value: string }[] = [
    { label: 'Forget after closing tab', value: 'sessionStorage' },
    { label: 'Persist after closing tab', value: 'localStorage' },
  ];

  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  constructor() {
    this.appService.chaoticEvent
      .pipe(
        filter((event) => event.type === 'merge_request'),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.mrOverviewService.mergeRequests.set(
          event.mr
            .map((mr) => ({
              ...mr,
              title: this.mrOverviewService.extractPkgName(mr.title) || mr.title,
            }))
            .sort((a, b) => (b.detailed_merge_status === 'not_approved' ? -1 : 1)),
        );
      });
  }

  async ngOnInit() {
    this.appService.updateSeoTags(
      this.meta,
      'Update review',
      'Review and approve pending merge requests for Chaotic-AUR',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR update review',
      this.router.url,
    );

    let tokenFromStorage: string | null = null;
    tokenFromStorage = sessionStorage.getItem('gitlabPrivateToken');
    if (!tokenFromStorage) {
      tokenFromStorage = localStorage.getItem('gitlabPrivateToken');
    }

    if (tokenFromStorage) {
      const decryptedToken: string = await decrypt(tokenFromStorage, 'thisaintrealsafety1!!1!');
      this.mrOverviewService.token.set(decryptedToken);
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
    void this.mrOverviewService.loadOpenMrs();
  }
}

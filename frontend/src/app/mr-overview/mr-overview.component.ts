import { Component, inject, OnInit } from '@angular/core';
import { MergeRequestData } from 'gitlab-mr-extractor';
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
  ],
  templateUrl: './mr-overview.component.html',
  styleUrl: './mr-overview.component.css',
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
  private readonly router = inject(Router);

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
      void this.mrOverviewService.extractMrs();
    }
  }

  /**
   * Checks if the approval process is ongoing for a given merge request.
   * @param mr The merge request to check.
   */
  isApproving(mr: MergeRequestData): boolean {
    const loadingMap = this.mrOverviewService.approveLoading();
    return loadingMap.has(mr.iid) && loadingMap.get(mr.iid) === true;
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

    this.mrOverviewService.token.set(value);
    this.messageToastService.success('Token Saved', 'GitLab private token has been saved to session storage.');
    void this.mrOverviewService.extractMrs();
  }
}

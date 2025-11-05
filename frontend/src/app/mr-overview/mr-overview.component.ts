import { Component, inject, OnInit } from '@angular/core';
import { MergeRequestData } from 'gitlab-mr-extractor';
import { TitleComponent } from '../title/title.component';
import { TableModule } from 'primeng/table';
import { DiffRendererComponent } from '../diff-renderer/diff-renderer.component';
import { Button } from 'primeng/button';
import { MessageToastService } from '@garudalinux/core';
import { FormsModule } from '@angular/forms';
import { InputText } from 'primeng/inputtext';
import { ProgressSpinner } from 'primeng/progressspinner';
import { MrOverviewService } from './mr-overview.service';
import { AutoFocus } from 'primeng/autofocus';

@Component({
  selector: 'chaotic-mr-overview',
  imports: [
    TitleComponent,
    TableModule,
    DiffRendererComponent,
    Button,
    FormsModule,
    InputText,
    ProgressSpinner,
    AutoFocus,
  ],
  templateUrl: './mr-overview.component.html',
  styleUrl: './mr-overview.component.css',
})
export class MrOverviewComponent implements OnInit {
  protected readonly mrOverviewService = inject(MrOverviewService);
  private readonly messageToastService = inject(MessageToastService);

  ngOnInit() {
    const tokenFromStorage = sessionStorage.getItem('gitlabPrivateToken');
    if (tokenFromStorage) {
      this.mrOverviewService.token.set(tokenFromStorage);
    }

    void this.mrOverviewService.extractMrs();
  }

  /**
   * Checks if the approval process is ongoing for a given merge request.
   * @param mr The merge request to check.
   */
  protected isApproving(mr: MergeRequestData): boolean {
    return (
      this.mrOverviewService.approveLoading().has(mr.iid) &&
      this.mrOverviewService.approveLoading().get(mr.iid) === true
    );
  }

  /**
   * Sets the GitLab private token in session storage and refreshes the merge requests.
   * @param value The GitLab private token to be saved.
   */
  protected setToken(value: string) {
    if (!value || value.trim().length === 0) {
      this.messageToastService.error('Invalid Token', 'Please provide a valid GitLab private token.');
      return;
    }

    this.mrOverviewService.token.set(value);
    sessionStorage.setItem('gitlabPrivateToken', value);
    this.messageToastService.success('Token Saved', 'GitLab private token has been saved to session storage.');
    void this.mrOverviewService.extractMrs();
  }
}

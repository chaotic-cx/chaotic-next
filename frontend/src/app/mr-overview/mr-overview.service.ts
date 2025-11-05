import { inject, Injectable, signal } from '@angular/core';
import { GitLabMergeRequestExtractor, MergeRequestData } from 'gitlab-mr-extractor';
import { lastValueFrom } from 'rxjs';
import { MessageToastService } from '@garudalinux/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class MrOverviewService {
  readonly mergeQuests = signal<MergeRequestData[]>([]);
  readonly token = signal<string>('');
  readonly isLoading = signal<boolean>(true);
  readonly approveLoading = signal<Map<number, boolean>>(new Map());

  private baseUrl = 'https://gitlab.com/api/v4';
  private projectId = 54867625;

  private readonly http = inject(HttpClient);
  private readonly messageToastService = inject(MessageToastService);

  /**
   * Extracts merge requests from the GitLab repository.
   * This method uses the GitLabMergeRequestExtractor to fetch merge requests
   * authored by any user.
   */
  async extractMrs() {
    const extractor = new GitLabMergeRequestExtractor({
      baseUrl: 'https://gitlab.com',
      privateToken: this.token(),
      projectId: this.projectId,
    });
    const mergeRequests = await extractor.extractMergeRequests({
      authorId: 0,
    });

    this.mergeQuests.set(
      mergeRequests
        .map((mr) => ({
          ...mr,
          title: this.extractPkgName(mr.title) || mr.title,
        }))
        .sort((a, b) => (b.detailed_merge_status === 'not_approved' ? -1 : 1)),
    );
    this.isLoading.set(false);
  }

  /**
   * Extracts the package name from the merge request title.
   * This assumes the title follows a specific format.
   * Example: "chore(mozc): PKGBUILD modified" -> "mozc"
   * @param title
   * @private
   */
  private extractPkgName(title: string): string | null {
    const match = title.match(/^[^(]*\(([^)]+)\)/);
    return match ? match[1] : null;
  }

  /**
   * Approves a merge request via GitLab API.
   * @param mr The merge request to approve.
   */
  async approve(mr: MergeRequestData) {
    const loadingMap = new Map(this.approveLoading());
    loadingMap.set(mr.iid, true);
    this.approveLoading.set(loadingMap);

    try {
      const response = await lastValueFrom(
        this.http.post(
          `${this.baseUrl}/projects/${this.projectId}/merge_requests/${mr.iid}/approve`,
          {
            sha: mr.sha,
          },
          {
            headers: {
              'PRIVATE-TOKEN': this.token(),
            },
          },
        ),
      );

      this.messageToastService.success(
        'Approval Successful',
        'Merge request approved successfully. The bot will auto-merge it soon.',
      );
      await this.extractMrs();
    } catch (error) {
      console.error('Approval failed', error);
      this.messageToastService.error('Approval Failed', 'Failed to approve the merge request. Please try again later.');
    } finally {
      const finalLoadingMap = new Map(this.approveLoading());
      finalLoadingMap.delete(mr.iid);
      this.approveLoading.set(finalLoadingMap);
    }
  }
}

import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { MessageToastService } from '@garudalinux/core';
import { HttpClient } from '@angular/common/http';
import { encrypt } from '../functions';
import { MergeRequestWithDiffs } from '@./shared-lib';
import { APP_CONFIG } from '../../environments/app-config.token';

@Injectable({
  providedIn: 'root',
})
export class MrOverviewService {
  readonly mergeRequests = signal<MergeRequestWithDiffs[]>([]);
  readonly token = signal<string>('');
  readonly isLoading = signal<boolean>(true);
  readonly loadingMap = signal<Map<number, boolean>>(new Map());
  readonly storage = signal<'sessionStorage' | 'localStorage'>('sessionStorage');

  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private readonly gitlabBaseUrl = 'https://gitlab.com/api/v4';
  private readonly projectId = 54867625;

  private readonly http = inject(HttpClient);
  private readonly messageToastService = inject(MessageToastService);

  constructor() {
    effect(async () => {
      const tokenValue = this.token();
      if (tokenValue === '') return;

      const encryptedValue = await encrypt(tokenValue, 'thisaintrealsafety1!!1!');
      if (untracked(this.storage) === 'sessionStorage') {
        sessionStorage.setItem('gitlabPrivateToken', encryptedValue);
      } else {
        localStorage.setItem('gitlabPrivateToken', encryptedValue);
      }
    });
  }

  /**
   * Retrieves the open merge requests from our backend (cached here).
   */
  async loadOpenMrs() {
    try {
      const mergeRequests: MergeRequestWithDiffs[] = await lastValueFrom(
        this.http.get<MergeRequestWithDiffs[]>(`${this.backendUrl}/gitlab/merge-requests`),
      );

      this.mergeRequests.set(
        mergeRequests
          .map((mr) => ({
            ...mr,
            title: this.extractPkgName(mr.title) || mr.title,
          }))
          .sort((a, b) => (b.detailed_merge_status === 'not_approved' ? -1 : 1)),
      );
      this.isLoading.set(false);
    } catch (error) {
      this.isLoading.set(false);
      this.messageToastService.error(
        'Error fetching merge requests',
        'An error occurred while fetching merge requests. Please check your token and try again.',
      );
      console.error('Error extracting merge requests:', error);
    }
  }

  /**
   * Extracts the package name from the merge request title.
   * This assumes the title follows a specific format.
   * Example: "chore(mozc): PKGBUILD modified" -> "mozc"
   * @param title
   * @private
   */
  extractPkgName(title: string): string | null {
    const match = title.match(/^[^(]*\(([^)]+)\)/);
    return match ? match[1] : null;
  }

  /**
   * Approves a merge request via GitLab API.
   * @param mr The merge request to approve.
   */
  async approve(mr: MergeRequestWithDiffs) {
    const loadingMap = new Map(this.loadingMap());
    loadingMap.set(mr.iid, true);
    this.loadingMap.set(loadingMap);

    try {
      const promises = [];
      promises.push(
        lastValueFrom(
          this.http.post(
            `${this.gitlabBaseUrl}/projects/${this.projectId}/merge_requests/${mr.iid}/approve`,
            {
              sha: mr.sha,
            },
            {
              headers: {
                'PRIVATE-TOKEN': this.token(),
              },
            },
          ),
        ),
      );

      // Add 'approved' label if not already present, since GitLab does not expose the approvers via API.
      // This will disable re-approvals and help track approved MRs.
      const labels: string[] = (mr.labels as string[]) || [];
      if (!labels.includes('approved')) {
        labels.push('approved');
        promises.push(
          lastValueFrom(
            this.http.put(
              `${this.gitlabBaseUrl}/projects/${this.projectId}/merge_requests/${mr.iid}`,
              { labels: labels.join(','), assignee_id: 20097372 },
              { headers: { 'PRIVATE-TOKEN': this.token() } },
            ),
          ),
        );
      }

      await Promise.all(promises);
      this.messageToastService.success(
        'Approval Successful',
        'Merge request approved successfully. The bot will auto-merge it soon.',
      );
    } catch (error) {
      const err = error as any;
      if (err.status === 401) {
        this.messageToastService.info(
          'Already approved',
          'This update seems to have been already approved by you? GitLab does not always return a valid status at all times.',
        );
        return;
      }
      this.messageToastService.error('Approval Failed', 'Failed to approve the merge request. Please try again later.');
      console.error('Error approving merge request:', error);
    } finally {
      const finalLoadingMap = new Map(this.loadingMap());
      finalLoadingMap.delete(mr.iid);
      this.loadingMap.set(finalLoadingMap);
    }
  }

  /**
   * Tests the provided GitLab private token for validity.
   * @param token The GitLab private token to test.
   * @returns A promise that resolves to true if the token is valid, false otherwise.
   */
  async testTokenWrite(token: string): Promise<boolean> {
    const url = `https://gitlab.com/api/v4/projects/${this.projectId}/labels`;
    const labelName = `test-label-${Date.now()}`;
    try {
      await lastValueFrom(
        this.http.post(
          url,
          { name: labelName, color: '#4287f5' },
          {
            headers: { 'PRIVATE-TOKEN': token },
          },
        ),
      );
      await lastValueFrom(
        this.http.delete(`${url}?name=${encodeURIComponent(labelName)}`, {
          headers: { 'PRIVATE-TOKEN': token },
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Flags a merge request as dangerous by adding a 'dangerous' label.
   * @param mr The merge request to flag.
   */
  flagDangerous(mr: MergeRequestWithDiffs) {
    const loadingMap = new Map(this.loadingMap());
    loadingMap.set(mr.iid, true);
    this.loadingMap.set(loadingMap);

    try {
      const labels: string[] = (mr.labels as string[]) || [];
      labels.push('dangerous');
      this.http
        .put(
          `${this.gitlabBaseUrl}/projects/${this.projectId}/merge_requests/${mr.iid}`,
          { labels: labels.join(',') },
          { headers: { 'PRIVATE-TOKEN': this.token() } },
        )
        .subscribe({
          next: () => {
            this.messageToastService.success(
              'Flagged as Dangerous',
              'The merge request has been flagged as dangerous.',
            );
          },
          error: (error) => {
            this.messageToastService.error(
              'Flagging Failed',
              'Failed to flag the merge request as dangerous. Please try again later.',
            );
            console.error('Error flagging merge request as dangerous:', error);
          },
          complete: () => {
            const finalLoadingMap = new Map(this.loadingMap());
            finalLoadingMap.delete(mr.iid);
            this.loadingMap.set(finalLoadingMap);
          },
        });
    } catch (error) {
      this.messageToastService.error(
        'Flagging Failed',
        'Failed to flag the merge request as dangerous. Please try again later.',
      );
      console.error('Error flagging merge request as dangerous:', error);
    } finally {
      const finalLoadingMap = new Map(this.loadingMap());
      finalLoadingMap.delete(mr.iid);
      this.loadingMap.set(finalLoadingMap);
    }
  }
}

import { MergeRequestWithDiffs } from '@chaotic-next/shared-lib';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { effect, inject, Service, signal, untracked } from '@angular/core';
import { MessageToastService } from '@garudalinux/core';
import { MergeRequestDiffSchema } from '@gitbeaker/core';
import { lastValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';
import { encrypt } from '../functions';

/**
 * Obfuscation password for the Gitlab token kept in local/session storage.
 * This is NOT security — anyone with access to the browser can recover the
 * token — it only avoids storing the plaintext token verbatim.
 */
export const TOKEN_OBFUSCATION_PASSWORD = 'thisaintrealsafety1!!1!';

/** Labels that can be attached to a merge request to block its review. */
export type MrFlagLabel = 'dangerous' | 'hold';

const FLAG_COPY: Record<MrFlagLabel, { success: [string, string]; error: [string, string] }> = {
  dangerous: {
    success: ['Flagged as Dangerous', 'The merge request has been flagged as dangerous.'],
    error: ['Flagging Failed', 'Failed to flag the merge request as dangerous. Please try again later.'],
  },
  hold: {
    success: ['Flagged as On Hold', 'The merge request has been flagged as on hold.'],
    error: ['Flagging Failed', 'Failed to flag the merge request as on hold. Please try again later.'],
  },
};

@Service()
export class MrOverviewService {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private readonly http = inject(HttpClient);
  private readonly messageToastService = inject(MessageToastService);

  readonly mergeRequests = signal<MergeRequestWithDiffs[]>([]);
  readonly token = signal<string>('');
  readonly isLoading = signal<boolean>(true);
  readonly loadingMap = signal<Map<number, boolean>>(new Map());
  readonly storage = signal<'sessionStorage' | 'localStorage'>('sessionStorage');

  constructor() {
    effect(async () => {
      const tokenValue = this.token();
      if (tokenValue === '') return;

      const encryptedValue = await encrypt(tokenValue, TOKEN_OBFUSCATION_PASSWORD);
      if (untracked(this.storage) === 'sessionStorage') {
        sessionStorage.setItem('gitlabPrivateToken', encryptedValue);
      } else {
        localStorage.setItem('gitlabPrivateToken', encryptedValue);
      }
    });
  }

  async loadOpenMrs() {
    try {
      const mergeRequests: MergeRequestWithDiffs[] = await lastValueFrom(
        this.http.get<MergeRequestWithDiffs[]>(`${this.backendUrl}/gitlab/merge-requests`),
      );

      this.mergeRequests.set(
        mergeRequests
          .filter(
            (mr) =>
              mr.labels.includes('human-review') && !mr.labels.includes('hold') && !mr.labels.includes('dangerous'),
          )
          .map((mr) => ({
            ...mr,
            title: this.extractPkgName(mr.title) || mr.title,
            diffs: this.sortDiff(mr.diffs),
          }))
          .sort(
            (a, b) =>
              Number(b.detailed_merge_status === 'not_approved') - Number(a.detailed_merge_status === 'not_approved'),
          ),
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
   * Example: "chore(update): mozc" -> "mozc"
   * @param title
   * @private
   */
  extractPkgName(title: string): string | null {
    const match = title.match(/^chore\(update\): ([\w@.+-]+)$/);
    return match ? match[1] : null;
  }

  /**
   * Approves a merge request via the backend.
   * @param mr The merge request to approve.
   */
  async approve(mr: MergeRequestWithDiffs) {
    const loadingMap = new Map(this.loadingMap());
    loadingMap.set(mr.iid, true);
    this.loadingMap.set(loadingMap);

    try {
      await lastValueFrom(
        this.http.post<unknown>(
          `${this.backendUrl}/gitlab/approve`,
          {
            iid: mr.iid,
            sha: mr.sha,
          },
          {
            headers: {
              'X-Gitlab-Private-Token': this.token(),
            },
          },
        ),
      );

      this.messageToastService.success(
        'Approval Successful',
        'Merge request approved successfully. The bot will auto-merge it soon.',
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
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
    try {
      return await lastValueFrom(
        this.http.post<boolean>(`${this.backendUrl}/gitlab/test-token`, null, {
          headers: {
            'X-Gitlab-Private-Token': token,
          },
        }),
      );
    } catch {
      return false;
    }
  }

  /**
   * Flags a merge request with the given label so it drops out of the review list.
   * @param mr The merge request to flag.
   * @param label The flag label to attach.
   */
  async flag(mr: MergeRequestWithDiffs, label: MrFlagLabel): Promise<void> {
    const copy = FLAG_COPY[label];
    const loadingMap = new Map(this.loadingMap());
    loadingMap.set(-mr.iid, true);
    this.loadingMap.set(loadingMap);

    try {
      await lastValueFrom(
        this.http.post<unknown>(
          `${this.backendUrl}/gitlab/flag`,
          {
            iid: mr.iid,
            label,
          },
          {
            headers: {
              'X-Gitlab-Private-Token': this.token(),
            },
          },
        ),
      );
      this.messageToastService.success(copy.success[0], copy.success[1]);
    } catch (error) {
      this.messageToastService.error(copy.error[0], copy.error[1]);
      console.error(`Error flagging merge request as ${label}:`, error);
    } finally {
      const finalLoadingMap = new Map(this.loadingMap());
      finalLoadingMap.delete(-mr.iid);
      this.loadingMap.set(finalLoadingMap);
    }
  }

  /**
   * Sorts the commit diffs to prioritize PKGBUILD and .SRCINFO files.
   * @param diffs The array of commit diffs to sort.
   * @returns The sorted array of commit diffs.
   */
  sortDiff(diffs: MergeRequestDiffSchema[]): MergeRequestDiffSchema[] {
    return [...diffs].sort((a, b) => {
      const getSortKey = (path: string): number => {
        if (path.endsWith('/PKGBUILD')) return 0;
        if (path.endsWith('/.SRCINFO')) return 1;
        return 2;
      };
      const keyA = getSortKey(a.new_path);
      const keyB = getSortKey(b.new_path);
      if (keyA !== keyB) return keyA - keyB;
      return a.new_path.localeCompare(b.new_path);
    });
  }
}

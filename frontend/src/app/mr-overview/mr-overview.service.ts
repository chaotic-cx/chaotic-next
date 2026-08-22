import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { MergeRequestWithDiffs } from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core';
import { MergeRequestDiffSchema } from '@gitbeaker/core';
import { lastValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';
import { backendErrorMessage } from '../api-errors';

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
  readonly isLoading = signal<boolean>(true);
  readonly loadingMap = signal<Map<string, boolean>>(new Map());

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
        'An error occurred while fetching merge requests. Please try again.',
      );
      console.error('Error extracting merge requests:', error);
    }
  }

  extractPkgName(title: string): string | null {
    const match = title.match(/^chore\(update\): ([\w@.+-]+)$/);
    return match ? match[1] : null;
  }

  async approve(mr: MergeRequestWithDiffs) {
    const loadingKey = `${mr.iid}:approve`;
    const loadingMap = new Map(this.loadingMap());
    loadingMap.set(loadingKey, true);
    this.loadingMap.set(loadingMap);

    try {
      const res = await lastValueFrom(
        this.http.post<{ deferred: boolean }>(`${this.backendUrl}/gitlab/approve`, {
          iid: mr.iid,
          sha: mr.sha,
        }),
      );

      if (res?.deferred) {
        this.messageToastService.success(
          'Approval Successful',
          'Merge request approved. The merge will be executed once the scheduled pipeline completes.',
        );
      } else {
        this.messageToastService.success('Approval Successful', 'Merge request approved and merged.');
      }

      this.mergeRequests.update((mrs) =>
        mrs.map((item) => {
          if (item.iid !== mr.iid) return item;
          const labels = item.labels.includes('approved') ? [...item.labels] : [...item.labels, 'approved'];
          return { ...item, labels };
        }),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.messageToastService.info(
          'Already approved',
          'This update seems to have been already approved by you? GitLab does not always return a valid status at all times.',
        );
        return;
      }
      this.messageToastService.error(
        'Approval Failed',
        backendErrorMessage(error, 'Failed to approve the merge request. Please try again later.'),
      );
      console.error('Error approving merge request:', error);
    } finally {
      const finalLoadingMap = new Map(this.loadingMap());
      finalLoadingMap.delete(loadingKey);
      this.loadingMap.set(finalLoadingMap);
    }
  }

  async flag(mr: MergeRequestWithDiffs, label: MrFlagLabel): Promise<void> {
    const copy = FLAG_COPY[label];
    const loadingKey = `${mr.iid}:flag:${label}`;
    const loadingMap = new Map(this.loadingMap());
    loadingMap.set(loadingKey, true);
    this.loadingMap.set(loadingMap);

    try {
      await lastValueFrom(
        this.http.post<unknown>(`${this.backendUrl}/gitlab/flag`, {
          iid: mr.iid,
          label,
        }),
      );
      this.messageToastService.success(copy.success[0], copy.success[1]);

      this.mergeRequests.update((mrs) =>
        mrs.map((item) => {
          if (item.iid !== mr.iid) return item;
          const labels = item.labels.includes(label) ? [...item.labels] : [...item.labels, label];
          return { ...item, labels };
        }),
      );
    } catch (error) {
      this.messageToastService.error(copy.error[0], backendErrorMessage(error, copy.error[1]));
      console.error(`Error flagging merge request as ${label}:`, error);
    } finally {
      const finalLoadingMap = new Map(this.loadingMap());
      finalLoadingMap.delete(loadingKey);
      this.loadingMap.set(finalLoadingMap);
    }
  }

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

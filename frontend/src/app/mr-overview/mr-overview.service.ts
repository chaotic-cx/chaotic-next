import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { FLAG_REASON_MAX_LENGTH, isReviewQueueMergeRequest, MergeRequestWithDiffs } from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core';
import { MergeRequestDiffSchema } from '@gitbeaker/core';
import { TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { lastValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';
import { backendErrorMessage } from '../api-errors';

export type MrFlagLabel = 'dangerous' | 'hold';

interface FlagToastKeys {
  successTitle: string;
  successMessage: string;
  errorMessage: string;
}

const FLAG_TOAST_KEYS: Record<MrFlagLabel, FlagToastKeys> = {
  dangerous: {
    successTitle: marker('reviewQueue.toast.flagDangerous.title'),
    successMessage: marker('reviewQueue.toast.flagDangerous.message'),
    errorMessage: marker('reviewQueue.toast.flagDangerous.error'),
  },
  hold: {
    successTitle: marker('reviewQueue.toast.flagHold.title'),
    successMessage: marker('reviewQueue.toast.flagHold.message'),
    errorMessage: marker('reviewQueue.toast.flagHold.error'),
  },
};

const HTTP_UNAUTHORIZED = 401;

@Service()
export class MrOverviewService {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private readonly http = inject(HttpClient);
  private readonly messageToastService = inject(MessageToastService);
  private readonly transloco = inject(TranslocoService);

  readonly mergeRequests = signal<MergeRequestWithDiffs[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly loadFailed = signal<boolean>(false);
  readonly loadingMap = signal<Map<string, boolean>>(new Map());

  async loadOpenMrs(): Promise<boolean> {
    try {
      const mergeRequests: MergeRequestWithDiffs[] = await lastValueFrom(
        this.http.get<MergeRequestWithDiffs[]>(`${this.backendUrl}/gitlab/merge-requests`),
      );

      this.mergeRequests.set(
        mergeRequests
          .filter(isReviewQueueMergeRequest)
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
      this.loadFailed.set(false);
      return true;
    } catch (error) {
      this.isLoading.set(false);
      this.loadFailed.set(true);
      this.messageToastService.error(
        this.transloco.translate('reviewQueue.toast.loadFailed.title'),
        this.transloco.translate('reviewQueue.toast.loadFailed.message'),
      );
      console.error('Error extracting merge requests:', error);
      return false;
    }
  }

  extractPkgName(title: string): string | null {
    return this.extractPkgNames(title)[0] ?? null;
  }

  extractPkgNames(title: string): string[] {
    const match = title.match(/^chore\(update\): ([\w@.+-]+(?:\s*[, ]\s*[\w@.+-]+)?)$/);
    if (!match) return [];
    return match[1].split(/\s*[, ]\s*/).filter(Boolean);
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

      const successTitle = this.transloco.translate('reviewQueue.toast.approved.title');
      if (res?.deferred) {
        this.messageToastService.success(
          successTitle,
          this.transloco.translate('reviewQueue.toast.approved.deferredMessage'),
        );
      } else {
        this.messageToastService.success(successTitle, this.transloco.translate('reviewQueue.toast.approved.message'));
      }

      this.mergeRequests.update((mrs) =>
        mrs.map((item) => {
          if (item.iid !== mr.iid) return item;
          const labels = item.labels.includes('approved') ? [...item.labels] : [...item.labels, 'approved'];
          return { ...item, labels };
        }),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === HTTP_UNAUTHORIZED) {
        this.messageToastService.info(
          this.transloco.translate('reviewQueue.toast.alreadyApproved.title'),
          this.transloco.translate('reviewQueue.toast.alreadyApproved.message'),
        );
        return;
      }

      this.messageToastService.error(
        this.transloco.translate('reviewQueue.toast.approveFailed.title'),
        backendErrorMessage(error, this.transloco.translate('reviewQueue.toast.approveFailed.message')),
      );
      console.error('Error approving merge request:', error);
    } finally {
      const finalLoadingMap = new Map(this.loadingMap());
      finalLoadingMap.delete(loadingKey);
      this.loadingMap.set(finalLoadingMap);
    }
  }

  readonly flagReasonMaxLength = FLAG_REASON_MAX_LENGTH;

  async flag(mr: MergeRequestWithDiffs, label: MrFlagLabel, reason: string): Promise<boolean> {
    const toastKeys = FLAG_TOAST_KEYS[label];
    const loadingKey = `${mr.iid}:flag:${label}`;
    const loadingMap = new Map(this.loadingMap());
    loadingMap.set(loadingKey, true);
    this.loadingMap.set(loadingMap);

    try {
      await lastValueFrom(
        this.http.post<unknown>(`${this.backendUrl}/gitlab/flag`, {
          iid: mr.iid,
          label,
          reason,
        }),
      );
      this.messageToastService.success(
        this.transloco.translate(toastKeys.successTitle),
        this.transloco.translate(toastKeys.successMessage),
      );

      const flagReason = {
        action: label,
        text: reason,
        userName: mr.flagReason?.userName ?? '',
        createdAt: new Date().toISOString(),
      } as const;
      this.mergeRequests.update((mrs) =>
        mrs.map((item) => {
          if (item.iid !== mr.iid) return item;
          const labels = item.labels.includes(label) ? [...item.labels] : [...item.labels, label];
          return { ...item, labels, flagReason: { ...flagReason } };
        }),
      );
      return true;
    } catch (error) {
      this.messageToastService.error(
        this.transloco.translate('reviewQueue.toast.flagFailedTitle'),
        backendErrorMessage(error, this.transloco.translate(toastKeys.errorMessage)),
      );
      console.error(`Error flagging merge request as ${label}:`, error);
      return false;
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

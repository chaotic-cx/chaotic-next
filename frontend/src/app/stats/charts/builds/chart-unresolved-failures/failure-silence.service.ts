import { Service, signal, type WritableResource, inject } from '@angular/core';
import type { UnresolvedFailedBuild } from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core/message-toast';
import { TranslocoService } from '@jsverse/transloco';
import { backendErrorMessage } from '../../../../api-errors';
import { AppService } from '../../../../app.service';

/** Silences or unsilences an unresolved failure with an optimistic update of the given list. */
@Service()
export class FailureSilenceService {
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly transloco = inject(TranslocoService);

  readonly busyPkgname = signal<string | null>(null);

  async toggle(
    row: UnresolvedFailedBuild,
    failures: WritableResource<UnresolvedFailedBuild[] | undefined>,
  ): Promise<void> {
    const silencing = !row.silenced;
    this.busyPkgname.set(row.pkgname);
    failures.update((rows) =>
      rows?.map((candidate) => (candidate.pkgname === row.pkgname ? { ...candidate, silenced: silencing } : candidate)),
    );

    try {
      if (silencing) {
        await this.appService.silenceUnresolvedFailedBuild(row.pkgname);
        this.messageToastService.success(
          this.transloco.translate('stats.failureSilence.silenced.title'),
          this.transloco.translate('stats.failureSilence.silenced.message', { package: row.pkgname }),
        );
      } else {
        await this.appService.unsilenceUnresolvedFailedBuild(row.pkgname);
        this.messageToastService.success(
          this.transloco.translate('stats.failureSilence.unsilenced.title'),
          this.transloco.translate('stats.failureSilence.unsilenced.message', { package: row.pkgname }),
        );
      }
    } catch (error) {
      this.messageToastService.error(
        this.transloco.translate('stats.failureSilence.error.title'),
        backendErrorMessage(
          error,
          this.transloco.translate('stats.failureSilence.error.message', { package: row.pkgname }),
        ),
      );
      failures.reload();
    } finally {
      this.busyPkgname.set(null);
    }
  }
}

import { Service, signal, type WritableResource, inject } from '@angular/core';
import type { UnresolvedFailedBuild } from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core';
import { backendErrorMessage } from '../../../../api-errors';
import { AppService } from '../../../../app.service';

/** Silences or unsilences an unresolved failure with an optimistic update of the given list. */
@Service()
export class FailureSilenceService {
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);

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
        this.messageToastService.success('Failure silenced', `${row.pkgname} stays hidden until it fails again.`);
      } else {
        await this.appService.unsilenceUnresolvedFailedBuild(row.pkgname);
        this.messageToastService.success('Failure unsilenced', `${row.pkgname} shows up as failing again.`);
      }
    } catch (error) {
      this.messageToastService.error(
        'Operation failed',
        backendErrorMessage(error, `Could not update ${row.pkgname}.`),
      );
      failures.reload();
    } finally {
      this.busyPkgname.set(null);
    }
  }
}

import { inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { TranslocoService } from '@jsverse/transloco';
import { copyLineLink } from '../functions';

/**
 * Line links of a log page: copies the link to a clicked line and keeps the line in the URL.
 * Create it in an injection context, for example in a component field.
 */
export class LogLineLink {
  private readonly messageToastService = inject(MessageToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  select(line: number): void {
    void this.copy(line);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { line },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private async copy(line: number): Promise<void> {
    try {
      await copyLineLink(line);
    } catch (error) {
      this.messageToastService.error(
        this.transloco.translate('logStream.copyFailed.title'),
        this.transloco.translate('logStream.copyFailed.message', { line }),
      );
      console.error(error);
      return;
    }

    this.messageToastService.success(
      this.transloco.translate('logStream.linkCopied.title'),
      this.transloco.translate('logStream.linkCopied.message', { line }),
    );
  }
}

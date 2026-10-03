import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Mirror } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { CodeBlockComponent } from '../docs/code-block.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { setPageSeo } from '../functions';
import { injectActiveTranslation } from '../i18n/active-translation';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { TitleComponent } from '../title/title.component';
import { SlowLoadingHintComponent } from '../ui-states/slow-loading-hint.component';
import { UnknownValueComponent } from '../ui-states/unknown-value.component';
import { type MirrorStatus, MirrorRowComponent } from './mirror-row.component';
import { MirrorsService } from './mirrors.service';

interface MirrorGroup {
  status: MirrorStatus;
  title: string;
  hint: string;
  mirrors: Mirror[];
}

const SKELETON_ROW_COUNT = 6;

@Component({
  selector: 'chaotic-mirrors',
  imports: [
    TitleComponent,
    MirrorRowComponent,
    CodeBlockComponent,
    RouterLink,
    TranslocoDirective,
    LoadErrorComponent,
    EmptyStateComponent,
    SlowLoadingHintComponent,
    UnknownValueComponent,
  ],
  templateUrl: './mirrors.component.html',
  styles: `
    .mirrors-featured {
      display: grid;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    @media (min-width: 768px) {
      .mirrors-featured {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .mirrors-featured__body {
      padding: 1rem 1.25rem 0.5rem;
      font-size: 0.9375rem;
      color: var(--catppuccin-color-subtext1);
    }
  `,
})
export class MirrorsComponent {
  private readonly transloco = inject(TranslocoService);

  protected readonly mirrorsService = inject(MirrorsService);

  private readonly activeTranslation = injectActiveTranslation();

  protected readonly geoServer = 'Server = https://geo-mirror.chaotic.cx/$repo/$arch';
  protected readonly cdnServer = 'Server = https://cdn-mirror.chaotic.cx/$repo/$arch';
  protected readonly skeletonRows = Array.from({ length: SKELETON_ROW_COUNT });

  protected readonly groups = computed<MirrorGroup[]>(() => {
    this.activeTranslation();

    const groups: MirrorGroup[] = [
      {
        status: 'online',
        title: this.transloco.translate('mirrors.status.online'),
        hint: this.transloco.translate('mirrors.hint.online'),
        mirrors: this.mirrorsService.onlineMirrors(),
      },
      {
        status: 'outdated',
        title: this.transloco.translate('mirrors.status.outdated'),
        hint: this.transloco.translate('mirrors.hint.outdated'),
        mirrors: this.mirrorsService.outdatedMirrors(),
      },
      {
        status: 'offline',
        title: this.transloco.translate('mirrors.status.offline'),
        hint: this.transloco.translate('mirrors.hint.offline'),
        mirrors: this.mirrorsService.offlineMirrors(),
      },
    ];

    return groups.filter((group) => group.mirrors.length > 0);
  });

  constructor() {
    setPageSeo(
      this.transloco.translate('routes.titleFormat', { page: this.transloco.translate('routes.mirrors') }),
      this.transloco.translate('mirrors.seo.description'),
      this.transloco.translate('mirrors.seo.keywords'),
    );
  }
}

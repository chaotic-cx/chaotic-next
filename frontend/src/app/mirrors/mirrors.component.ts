import { Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Mirror } from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core';
import { CodeBlockComponent } from '../docs/code-block.component';
import { setPageSeo } from '../functions';
import { TitleComponent } from '../title/title.component';
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
  imports: [TitleComponent, MirrorRowComponent, CodeBlockComponent, RouterLink],
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
      color: var(--ctp-mocha-subtext1);
    }

    .mirrors-featured__body a {
      color: var(--ctp-mocha-mauve);
    }
  `,
  providers: [MessageToastService],
})
export class MirrorsComponent {
  private readonly messageToastService = inject(MessageToastService);

  protected readonly mirrorsService = inject(MirrorsService);

  protected readonly geoServer = 'Server = https://geo-mirror.chaotic.cx/$repo/$arch';
  protected readonly cdnServer = 'Server = https://cdn-mirror.chaotic.cx/$repo/$arch';
  protected readonly skeletonRows = Array.from({ length: SKELETON_ROW_COUNT });

  protected readonly groups = computed<MirrorGroup[]>(() =>
    [
      {
        status: 'online' as const,
        title: 'Online',
        hint: 'Up to date',
        mirrors: this.mirrorsService.onlineMirrors(),
      },
      {
        status: 'outdated' as const,
        title: 'Outdated',
        hint: 'Not used by the GEO mirror; direct requests return an error',
        mirrors: this.mirrorsService.outdatedMirrors(),
      },
      {
        status: 'offline' as const,
        title: 'Offline',
        hint: 'The up-to-date check fails completely',
        mirrors: this.mirrorsService.offlineMirrors(),
      },
    ].filter((group) => group.mirrors.length > 0),
  );

  constructor() {
    setPageSeo(
      'Mirrors · Chaotic-AUR',
      'Chaotic-AUR mirrors, down for everyone or just me?',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR mirrors',
    );
    effect(() => {
      if (this.mirrorsService.error()) {
        this.messageToastService.error('Error', 'Failed to fetch mirror list, the router may be down');
      }
    });
  }
}

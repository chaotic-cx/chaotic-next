import { CommonModule } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { Panel } from '@openng/optimus-ui/panel';
import { Skeleton } from '@openng/optimus-ui/skeleton';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { setPageSeo } from '../functions';
import { TitleComponent } from '../title/title.component';
import { MirrorCardComponent } from './mirror-card.component';
import { MirrorsService } from './mirrors.service';

@Component({
  selector: 'chaotic-mirrors',
  imports: [CommonModule, TitleComponent, Tooltip, Panel, Skeleton, MirrorCardComponent, RouterLink],
  templateUrl: './mirrors.component.html',
  styleUrl: './mirrors.component.css',
  providers: [MessageToastService],
})
export class MirrorsComponent {
  private readonly messageToastService = inject(MessageToastService);

  protected readonly mirrorsService = inject(MirrorsService);

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

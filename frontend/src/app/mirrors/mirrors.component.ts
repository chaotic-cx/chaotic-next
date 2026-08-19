import { CommonModule } from '@angular/common';
import { Component, effect, inject, LOCALE_ID, OnInit } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { Panel } from '@openng/optimus-ui/panel';
import { Skeleton } from '@openng/optimus-ui/skeleton';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AppService } from '../app.service';
import { TitleComponent } from '../title/title.component';
import { MirrorCardComponent } from './mirror-card.component';
import { MirrorsService } from './mirrors.service';

@Component({
  selector: 'chaotic-mirrors',
  imports: [CommonModule, TitleComponent, Tooltip, Panel, Skeleton, MirrorCardComponent, RouterLink],
  templateUrl: './mirrors.component.html',
  styleUrl: './mirrors.component.css',
  providers: [MessageToastService, { provide: LOCALE_ID, useValue: 'en-GB' }],
})
export class MirrorsComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);

  protected readonly mirrorsService = inject(MirrorsService);

  constructor() {
    effect(() => {
      if (this.mirrorsService.error()) {
        this.messageToastService.error('Error', 'Failed to fetch mirror list, the router may be down');
      }
    });
  }

  ngOnInit() {
    this.appService.updateSeoTags(this.meta, {
      title: 'Mirrors',
      description: 'Chaotic-AUR mirrors, down for everyone or just me?',
      keywords:
        'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR mirrors',
      url: this.router.url,
    });
  }
}

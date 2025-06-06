import { Mirror, MirrorData, MirrorSelf } from '@./shared-lib';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  LOCALE_ID,
  OnInit,
  signal,
} from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { TableModule } from 'primeng/table';
import { Tooltip } from 'primeng/tooltip';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { TitleComponent } from '../title/title.component';

@Component({
  selector: 'app-mirrors',
  imports: [CommonModule, TitleComponent, TableModule, Tooltip],
  templateUrl: './mirrors.component.html',
  styleUrl: './mirrors.component.css',
  providers: [MessageToastService, { provide: LOCALE_ID, useValue: 'en-GB' }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MirrorsComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);

  loading = signal<boolean>(true);
  mirrorData: MirrorData = { self: {} as MirrorSelf, mirrors: [] };

  ngOnInit() {
    this.appService.updateSeoTags(
      this.meta,
      'Mirrors',
      'Chaotic-AUR mirrors, down for everyone or just me?',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR mirrors',
      this.router.url,
    );

    this.appService
      .getMirrorsStats()
      .pipe(retry({ count: 3, delay: 5000 }))
      .subscribe({
        next: (data) => {
          const preparedMirrors: Mirror[] = data.mirrors.map((mirror) => {
            mirror.last_update = mirror.last_update * 1000;
            return mirror;
          });
          this.mirrorData.self = data.self;
          this.mirrorData.mirrors = preparedMirrors;
          this.loading.set(false);
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to fetch mirror list, the router may be down');
          console.error(err);
          this.loading.set(false);
        },
        complete: () => {
          this.loading.set(false);
          this.cdr.markForCheck();
        },
      });
  }
}

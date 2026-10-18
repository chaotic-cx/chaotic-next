import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { map } from 'rxjs';
import { AppService } from '../app.service';
import { BirthdayBannerComponent } from '../birthday/banner/birthday-banner.component';
import { MATRIX_ROOM_URL } from '../community-links';
import { parseFocusQuery, setPageSeo } from '../functions';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { MirrorMapComponent } from '../mirror-map/mirror-map.component';
import { MirrorsService } from '../mirrors/mirrors.service';
import { NewsfeedComponent } from '../newsfeed/newsfeed.component';
import { RecentlyAddedComponent } from '../recently-added/recently-added.component';
import { HomeHeroComponent } from './home-hero.component';
import { PipelineStripComponent } from './pipeline-strip.component';

@Component({
  selector: 'chaotic-home',
  imports: [
    BirthdayBannerComponent,
    HomeHeroComponent,
    NewsfeedComponent,
    RecentlyAddedComponent,
    MirrorMapComponent,
    PipelineStripComponent,
    LoadErrorComponent,
    RouterLink,
    TranslocoDirective,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  private readonly appService = inject(AppService);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  protected readonly mirrorsService = inject(MirrorsService);
  protected readonly sseConnected = this.appService.sseConnected;

  protected readonly matrixRoomUrl = MATRIX_ROOM_URL;

  protected readonly focus = toSignal(this.route.queryParamMap.pipe(map(parseFocusQuery)), {
    initialValue: null as [number, number] | null,
  });

  constructor() {
    // The home page uses the site texts, but it needs its own URL and canonical link like every other page.
    setPageSeo(
      this.transloco.translate('app.meta.ogTitle'),
      this.transloco.translate('app.meta.description'),
      this.transloco.translate('app.meta.keywords'),
    );
  }
}

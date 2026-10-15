import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { map } from 'rxjs';
import { AppService } from '../app.service';
import { MATRIX_ROOM_URL } from '../community-links';
import { parseFocusQuery } from '../functions';
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
  protected readonly mirrorsService = inject(MirrorsService);
  protected readonly sseConnected = this.appService.sseConnected;

  protected readonly matrixRoomUrl = MATRIX_ROOM_URL;

  protected readonly focus = toSignal(this.route.queryParamMap.pipe(map(parseFocusQuery)), {
    initialValue: null as [number, number] | null,
  });
}

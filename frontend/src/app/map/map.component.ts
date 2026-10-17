import { Component, effect, inject, OnDestroy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { map } from 'rxjs';
import { parseFocusQuery, setPageSeo } from '../functions';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { LiveTrafficService } from '../mirror-map/live-traffic.service';
import { MirrorMapComponent } from '../mirror-map/mirror-map.component';
import { MirrorsService } from '../mirrors/mirrors.service';
import { TitleComponent } from '../title/title.component';
import { LiveTrafficFeedComponent } from './live-traffic-feed.component';

@Component({
  selector: 'chaotic-map',
  imports: [TitleComponent, MirrorMapComponent, LiveTrafficFeedComponent, LoadErrorComponent, TranslocoDirective],
  template: `
    <div class="mx-auto flex w-full flex-1 flex-col" *transloco="let t; prefix: 'map'">
      <chaotic-title [title]="t('title')" [subtitleHtml]="t('subtitle')" />

      @if (mirrorsService.error()) {
        <chaotic-load-error
          class="mb-3 block"
          [message]="mirrorsService.errorMessage()"
          [error]="mirrorsService.error()"
          (retry)="mirrorsService.reload()"
        />
      }

      <chaotic-mirror-map
        class="backdrop-blur-(--chaotic-blur) w-full flex-1"
        [fillHeight]="true"
        [mirrors]="mirrorsService.mirrors()"
        [self]="mirrorsService.self()"
        [focus]="focus()"
        [countsKnown]="mirrorsService.mirrorData() !== null"
        [livePingsEnabled]="true"
        [showHits]="trafficService.showHits()"
        [showMirrors]="trafficService.showMirrors()"
        [projection]="trafficService.mapProjection()"
      />

      <div class="w-full shrink-0">
        <chaotic-live-traffic-feed />
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: calc(100dvh - 130px);
        width: 100%;
      }
    `,
  ],
})
export class MapComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly mirrorsService = inject(MirrorsService);
  protected readonly trafficService = inject(LiveTrafficService);

  protected readonly focus = toSignal(this.route.queryParamMap.pipe(map(parseFocusQuery)), {
    initialValue: null as [number, number] | null,
  });

  constructor() {
    setPageSeo(
      this.transloco.translate('routes.titleFormat', { page: this.transloco.translate('routes.mirrorMap') }),
      this.transloco.translate('map.seo.description'),
      this.transloco.translate('map.seo.keywords'),
    );

    this.trafficService.connect();
    const params = this.route.snapshot.queryParamMap;
    if (params.has('hits')) {
      this.trafficService.showHits.set(params.get('hits') !== 'false');
    }
    if (params.has('mirrors')) {
      this.trafficService.showMirrors.set(params.get('mirrors') !== 'false');
    }
    if (params.has('projection')) {
      const proj = params.get('projection');
      if (proj === 'flat' || proj === 'globe') {
        this.trafficService.mapProjection.set(proj);
      }
    }

    let initialized = false;
    effect(() => {
      const hits = this.trafficService.showHits();
      const mirrors = this.trafficService.showMirrors();
      const projection = this.trafficService.mapProjection();

      if (!initialized) {
        initialized = true;
        return;
      }

      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          hits: hits ? null : 'false',
          mirrors: mirrors ? null : 'false',
          projection: projection === 'globe' ? null : 'flat',
        },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  }

  ngOnDestroy() {
    this.trafficService.disconnect();
  }
}

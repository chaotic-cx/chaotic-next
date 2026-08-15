import { Component, computed, effect, inject } from '@angular/core';
import type { Mirror } from '@chaotic-next/shared-lib';
import { flavors } from '@catppuccin/palette';
import { Dot, NgxMapComponent } from '@omnedia/ngx-map';
import { MirrorsService } from '../mirrors/mirrors.service';
import { precomputedMap } from './map';

const MIRROR_ICON_URL = 'https://chaotic.cx/favicon.ico';

@Component({
  selector: 'chaotic-mirror-map',
  templateUrl: './mirror-map.component.html',
  styleUrl: './mirror-map.component.css',
  imports: [NgxMapComponent],
})
export class MirrorMapComponent {
  protected readonly mirrorsService = inject(MirrorsService);
  protected readonly lineColor = flavors.mocha.colors.mauve.hex;
  protected readonly mapColor = flavors.mocha.colors.surface1.hex;
  protected readonly precomputedMap = precomputedMap;

  protected readonly dots = computed<Dot[]>(() => {
    const selfLatlon = this.mirrorsService.self()?.latlon;
    const hasSelfLatlon = Array.isArray(selfLatlon) && selfLatlon.length >= 2;
    return this.mirrorsService
      .mirrors()
      .filter(
        (mirror): mirror is Mirror & { latlon: [number, number] } =>
          Array.isArray(mirror.latlon) && mirror.latlon.length >= 2,
      )
      .map((mirror) => {
        const position = { lat: mirror.latlon[0], lng: mirror.latlon[1] };
        return {
          ...position,
          start: position,
          // Without our own coordinates there is nothing to draw a line to.
          end: hasSelfLatlon ? { lat: selfLatlon[0], lng: selfLatlon[1] } : position,
          label: mirror.subdomain,
          icon: MIRROR_ICON_URL,
        };
      });
  });

  constructor() {
    effect(() => {
      const error = this.mirrorsService.error();
      if (error) console.error(error);
    });
  }
}

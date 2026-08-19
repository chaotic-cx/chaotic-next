import { Component, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AppService } from '../app.service';
import { parseFocusQuery } from '../functions';
import { MirrorMapComponent } from '../mirror-map/mirror-map.component';
import { MirrorsService } from '../mirrors/mirrors.service';
import { TitleComponent } from '../title/title.component';

@Component({
  selector: 'chaotic-map',
  imports: [TitleComponent, MirrorMapComponent],
  template: `
    <div class="mx-auto flex w-full flex-1 flex-col">
      <chaotic-title
        title="Mirror map"
        subtitleHtml="Where our mirrors are located. Pick a mirror from the overview to see details."
      />
      <chaotic-mirror-map
        [fillHeight]="true"
        [mirrors]="mirrorsService.mirrors()"
        [self]="mirrorsService.self()"
        [focus]="focus()"
      />
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 1 0;
        width: 100%;
      }
    `,
  ],
})
export class MapComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly mirrorsService = inject(MirrorsService);

  protected readonly focus = toSignal(this.route.queryParamMap.pipe(map(parseFocusQuery)), {
    initialValue: null as [number, number] | null,
  });

  ngOnInit() {
    this.appService.updateSeoTags(this.meta, {
      title: 'Mirror map',
      description: 'Map of Chaotic-AUR mirrors.',
      keywords: 'Chaotic-AUR, Mirrors, Map, Repository, Archlinux, AUR',
      url: this.router.url,
    });
  }
}

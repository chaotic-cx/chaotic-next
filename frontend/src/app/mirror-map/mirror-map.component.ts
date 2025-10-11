import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { Dot } from '@omnedia/ngx-map';
import { NgxMapComponent } from '../dotted-map/ngx-map.component';
import { AppService } from '../app.service';
import { retry } from 'rxjs';
import { flavors } from '@catppuccin/palette';

@Component({
  selector: 'chaotic-mirror-map',
  templateUrl: './mirror-map.component.html',
  styleUrl: './mirror-map.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxMapComponent],
})
export class MirrorMapComponent implements OnInit {
  protected dots: Dot[] = [];
  protected readonly loading = signal<boolean>(true);
  protected readonly lineColor = flavors.mocha.colors.mauve.hex;
  protected readonly mapColor = flavors.mocha.colors.surface1.hex;

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit() {
    this.appService
      .getMirrorsStats()
      .pipe(retry({ count: 3, delay: 5000 }))
      .subscribe({
        next: (data) => {
          this.dots = data.mirrors
            .filter((mirror) => mirror.latlon?.length > 0)
            .map((mirror) => {
              return {
                lat: mirror.latlon[0],
                lng: mirror.latlon[1],
                end: { lat: data.self.latlon[0], lng: data.self.latlon[1] },
                start: { lat: mirror.latlon[0], lng: mirror.latlon[1] },
                label: mirror.subdomain,
                icon: 'https://chaotic.cx/favicon.ico',
              };
            });
          this.loading.set(false);
        },
        error: (err) => {
          console.error(err);
        },
        complete: () => {
          this.loading.set(false);
          this.cdr.markForCheck();
        },
      });
  }
}

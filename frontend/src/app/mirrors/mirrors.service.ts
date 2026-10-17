import type { MirrorData } from '@chaotic-next/shared-lib';
import { httpResource } from '@angular/common/http';
import { computed, inject, Service } from '@angular/core';
import { translateSignal } from '@jsverse/transloco';
import { AppService } from '../app.service';
import { resourceValue } from '../functions';
import { injectIsBrowser } from '../platform';

@Service()
export class MirrorsService {
  private readonly appService = inject(AppService);
  private readonly isBrowser = injectIsBrowser();

  // Prerendered pages show no mirror data. The browser loads it after hydration.
  private readonly mirrorsResource = httpResource<MirrorData>(() =>
    this.isBrowser ? this.appService.getMirrorsStatsResourceRequest() : undefined,
  );

  readonly loading = this.mirrorsResource.isLoading;
  readonly error = this.mirrorsResource.error;

  readonly errorMessage = translateSignal('mirrors.loadError');

  readonly mirrorData = computed<MirrorData | null>(() => {
    const data = resourceValue(this.mirrorsResource);
    if (!data) return null;

    return {
      self: data.self,
      // The router reports last_update in seconds. Convert it once at the boundary.
      mirrors: data.mirrors.map((mirror) => ({ ...mirror, last_update: mirror.last_update * 1000 })),
    };
  });

  readonly self = computed(() => this.mirrorData()?.self);
  readonly mirrors = computed(() => this.mirrorData()?.mirrors ?? []);

  readonly onlineMirrors = computed(() => this.mirrors().filter((m) => m.healthy));
  readonly outdatedMirrors = computed(() => this.mirrors().filter((m) => !m.healthy && m.last_update !== 0));
  readonly offlineMirrors = computed(() => this.mirrors().filter((m) => !m.healthy && m.last_update === 0));

  reload(): void {
    this.mirrorsResource.reload();
  }
}

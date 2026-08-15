import type { MirrorData } from '@chaotic-next/shared-lib';
import { httpResource } from '@angular/common/http';
import { computed, inject, Service } from '@angular/core';
import { AppService } from '../app.service';

@Service()
export class MirrorsService {
  private readonly appService = inject(AppService);

  private readonly mirrorsResource = httpResource<MirrorData>(() => this.appService.getMirrorsStatsResourceRequest());

  readonly loading = this.mirrorsResource.isLoading;
  readonly error = this.mirrorsResource.error;

  readonly mirrorData = computed<MirrorData | null>(() => {
    const data = this.mirrorsResource.value();
    if (!data) return null;
    return {
      self: data.self,
      // The router reports last_update in seconds; convert once at the boundary.
      mirrors: data.mirrors.map((mirror) => ({ ...mirror, last_update: mirror.last_update * 1000 })),
    };
  });

  readonly self = computed(() => this.mirrorData()?.self);
  readonly mirrors = computed(() => this.mirrorData()?.mirrors ?? []);

  readonly onlineMirrors = computed(() => this.mirrors().filter((m) => m.healthy));
  readonly outdatedMirrors = computed(() => this.mirrors().filter((m) => !m.healthy && m.last_update !== 0));
  readonly offlineMirrors = computed(() => this.mirrors().filter((m) => !m.healthy && m.last_update === 0));
}

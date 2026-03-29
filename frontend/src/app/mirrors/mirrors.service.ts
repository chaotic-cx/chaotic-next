import { computed, Injectable, signal } from '@angular/core';
import { MirrorData, MirrorSelf } from '@./shared-lib';

@Injectable({
  providedIn: 'root',
})
export class MirrorsService {
  readonly loading = signal<boolean>(true);
  readonly mirrorData = signal<MirrorData>({ self: {} as MirrorSelf, mirrors: [] });

  readonly onlineMirrors = computed(() => this.mirrorData().mirrors.filter((m) => m.healthy));
  readonly outdatedMirrors = computed(() => this.mirrorData().mirrors.filter((m) => !m.healthy && m.last_update !== 0));
  readonly offlineMirrors = computed(() => this.mirrorData().mirrors.filter((m) => !m.healthy && m.last_update === 0));
}

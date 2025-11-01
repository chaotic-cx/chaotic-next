import { Injectable, signal } from '@angular/core';
import { MirrorData, MirrorSelf } from '@./shared-lib';

@Injectable({
  providedIn: 'root',
})
export class MirrorsService {
  readonly loading = signal<boolean>(true);
  readonly mirrorData = signal<MirrorData>({ self: {} as MirrorSelf, mirrors: [] });
}

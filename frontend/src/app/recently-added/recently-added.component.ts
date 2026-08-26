import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type Package, type Paginated, formatPkgrel } from '@chaotic-next/shared-lib';
import { TagModule } from '@openng/optimus-ui/tag';
import { AppService } from '../app.service';
import { resourceValue } from '../functions';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';

const RECENT_COUNT = 9;
const STAGGER_CAP = 8;

@Component({
  selector: 'chaotic-recently-added',
  imports: [RouterLink, TagModule, RelativeTimePipe],
  templateUrl: './recently-added.component.html',
  styleUrl: './recently-added.component.css',
})
export class RecentlyAddedComponent {
  private readonly appService = inject(AppService);

  private readonly resource = httpResource<Paginated<Package>>(() =>
    this.appService.getPackagesResourceRequest({ page: 1, perPage: RECENT_COUNT, sort: 'createdAt', order: 'DESC' }),
  );

  readonly packages = computed(() => resourceValue(this.resource)?.items ?? []);
  readonly loading = this.resource.isLoading;

  readonly placeholderCount = Array.from({ length: RECENT_COUNT });

  protected readonly STAGGER_CAP = STAGGER_CAP;

  protected versionLabel(pkg: Package): string {
    const base = pkg.version ?? '';
    return pkg.pkgrel !== undefined ? `${base}-${formatPkgrel(pkg.pkgrel, pkg.bump ?? 0)}` : base;
  }
}

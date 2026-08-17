import { DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, effect, inject, input, LOCALE_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Package } from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core';
import { Button } from '@openng/optimus-ui/button';
import { IconFieldModule } from '@openng/optimus-ui/iconfield';
import { InputIconModule } from '@openng/optimus-ui/inputicon';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MultiSelectModule } from '@openng/optimus-ui/multiselect';
import { Select } from '@openng/optimus-ui/select';
import { Table, TableLazyLoadEvent, TableModule } from '@openng/optimus-ui/table';
import { TagModule } from '@openng/optimus-ui/tag';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AuthService } from 'ngx-better-auth';
import { APP_CONFIG } from '../../environments/app-config.token';
import { EnvironmentModel } from '../../environments/environment.model';
import { AppService } from '../app.service';
import { castTo } from '../functions';
import { StripPrefixPipe } from '../pipes/strip-prefix.pipe';
import { TitleComponent } from '../title/title.component';
import { PackageListService } from './package-list.service';

@Component({
  selector: 'chaotic-package-list',
  imports: [
    TableModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    FormsModule,
    MultiSelectModule,
    Select,
    TagModule,
    DatePipe,
    Button,
    StripPrefixPipe,
    TitleComponent,
    Tooltip,
  ],
  templateUrl: './package-list.component.html',
  styleUrl: './package-list.component.css',
  providers: [MessageToastService, PackageListService, { provide: LOCALE_ID, useValue: 'en-GB' }],
})
export class PackageListComponent {
  private readonly authService = inject(AuthService);
  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  protected readonly packageListService = inject(PackageListService);

  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly search = input<string>();

  constructor() {
    this.appService.updateSeoTags(this.meta, {
      title: 'Package list',
      description: 'List of all packages available in the Chaotic-AUR repository',
      keywords:
        'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR package list',
      url: this.router.url,
    });

    effect(() => {
      const q = this.search();
      if (q) this.packageListService.setSearch(q);
    });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    this.packageListService.setPage(event.first ?? 0, event.rows ?? 25);
    this.packageListService.setSort(
      typeof event.sortField === 'string' ? event.sortField : 'pkgname',
      event.sortOrder ?? 1,
    );
  }

  clear(table: Table) {
    table.clear();
    this.packageListService.setSearch('');
    this.packageListService.setRepoFilter(undefined);
    void this.router.navigate([], {
      queryParams: { search: null, repo: null },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
    this.cdr.markForCheck();
  }

  globalFilter(target: EventTarget | null) {
    if (!(target instanceof HTMLInputElement)) return;
    this.packageListService.setSearch(target.value);
    void this.router.navigate([], {
      queryParams: { search: target.value || null },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
  }

  onRepoFilter(repoId: number | null): void {
    const repoName = repoId === null ? null : this.repoNameById(repoId);
    this.packageListService.setRepoFilter(repoName);
    void this.router.navigate([], {
      queryParams: { repo: repoName },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
  }

  private repoNameById(id: number): string | undefined {
    return this.packageListService.repos()?.find((repo) => repo.id === id)?.name;
  }

  readonly typed = castTo<Package>;

  openPkgbuild(pkg: Package) {
    const url: string = pkg.repo === this.appConfig.repoId ? this.appConfig.repoUrl : this.appConfig.repoUrlGaruda;
    window.open(`${url}/${pkg.pkgname}`, '_blank');
  }

  openDetail(pkg: Package) {
    void this.router.navigate(['/stats'], { queryParams: { search: pkg.pkgname } });
  }

  triggerRebuild(pkg: Package) {
    void this.router.navigate(['/pipeline-trigger'], {
      queryParams: { operation: 'Bump Packages', packages: pkg.pkgname },
    });
  }
}

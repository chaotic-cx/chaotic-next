import { LocaleDatePipe } from '../pipes/locale-date.pipe';
import { ChangeDetectorRef, Component, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounce, FormField, form } from '@angular/forms/signals';
import { Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Package, formatPkgrel } from '@chaotic-next/shared-lib';
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
import { APP_CONFIG } from '../../environments/app-config.token';
import { EnvironmentModel } from '../../environments/environment.model';
import { AppService } from '../app.service';
import { castTo } from '../functions';
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { StripPrefixPipe } from '../pipes/strip-prefix.pipe';
import { ColumnVisibilityComponent, type ColumnDef } from '../table-columns/column-visibility.component';
import { ColumnVisibilityService } from '../table-columns/column-visibility.service';
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
    LocaleDatePipe,
    Button,
    FormField,
    StripPrefixPipe,
    RelativeTimePipe,
    BuildClassPipe,
    TitleComponent,
    Tooltip,
    ColumnVisibilityComponent,
  ],
  templateUrl: './package-list.component.html',
  styleUrl: './package-list.component.css',
  providers: [MessageToastService, PackageListService],
  host: {
    '(document:keydown)': 'focusSearchOnShortcut($event)',
  },
})
export class PackageListComponent {
  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  protected readonly packageListService = inject(PackageListService);
  protected readonly columnVisibility = inject(ColumnVisibilityService);

  protected readonly formatPkgrel = formatPkgrel;

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly search = input<string>();

  protected readonly packageColumns: ColumnDef[] = [
    { key: 'name', label: 'Name' },
    { key: 'version', label: 'Version' },
    { key: 'lastUpdated', label: 'Last updated' },
    { key: 'buildClass', label: 'Build class', defaultVisible: false },
    { key: 'pkgbaseName', label: 'Pkgbase', defaultVisible: false },
    { key: 'description', label: 'Description' },
    { key: 'homepage', label: 'Homepage' },
    { key: 'repo', label: 'Repository' },
    { key: 'actions', label: 'PKGBUILD' },
  ];

  protected readonly searchModel = signal({ query: this.packageListService.searchValue() });
  protected readonly searchForm = form(this.searchModel, (schemaPath) => {
    debounce(schemaPath.query, 300);
  });

  constructor() {
    this.columnVisibility.register('package-list-table', [
      'name',
      'version',
      'lastUpdated',
      'buildClass',
      'pkgbaseName',
      'description',
      'homepage',
      'repo',
      'actions',
    ]);
    this.appService.updateSeoTags(this.meta, {
      title: 'Package list',
      description: 'List of all packages available in the Chaotic-AUR repository',
      keywords:
        'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR package list',
      url: this.router.url,
    });

    effect(() => {
      const q = this.search();
      if (q) this.searchModel.update((model) => ({ ...model, query: q }));
    });

    effect(() => {
      this.applySearch(this.searchForm.query().value());
    });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    this.packageListService.setPage(event.first ?? 0, event.rows ?? 25);
    this.packageListService.setSort(
      typeof event.sortField === 'string' ? event.sortField : 'pkgname',
      event.sortOrder ?? 1,
    );
  }

  protected focusSearchOnShortcut(event: KeyboardEvent): void {
    if (!event.ctrlKey || event.key.toLowerCase() !== 'f') return;
    event.preventDefault();
    this.searchInput()?.nativeElement.focus();
    this.searchInput()?.nativeElement.select();
  }

  clear(table: Table) {
    table.clear();
    table.clearState();
    this.searchModel.update((model) => ({ ...model, query: '' }));
    this.packageListService.setRepoFilter(undefined);
    void this.router.navigate([], {
      queryParams: { search: null, repo: null },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
    this.cdr.markForCheck();
  }

  private applySearch(query: string): void {
    this.packageListService.setSearch(query);
    void this.router.navigate([], {
      queryParams: { search: query || null },
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
}

import { DatePipe } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounce, FormField, form } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { Package, formatPkgrel } from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
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
import { ClearFiltersComponent } from '../empty-state/clear-filters.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { castTo, setPageSeo } from '../functions';
import { injectActiveTranslation } from '../i18n/active-translation';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { IsoDateTimePipe } from '../pipes/iso-date-time.pipe';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { ColumnVisibilityComponent, type ColumnDef } from '../table-columns/column-visibility.component';
import { ColumnVisibilityService } from '../table-columns/column-visibility.service';
import { MISSING_VALUE } from '../table-columns/missing-value';
import { TablePageReportDirective } from '../table-page-report.directive';
import { DEFAULT_PER_PAGE } from '../table-pagination';
import { TABLE_ROW_HEIGHTS } from '../table-skeleton/table-row-heights';
import { TableSkeletonRowsComponent } from '../table-skeleton/table-skeleton-rows.component';
import { TitleComponent } from '../title/title.component';
import { PackageListService } from './package-list.service';

@Component({
  selector: 'chaotic-package-list',
  imports: [
    TableSkeletonRowsComponent,
    LoadErrorComponent,
    DatePipe,
    TableModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    FormsModule,
    MultiSelectModule,
    Select,
    TagModule,
    FormField,
    IsoDateTimePipe,
    RelativeTimePipe,
    BuildClassPipe,
    TitleComponent,
    Tooltip,
    ColumnVisibilityComponent,
    ClearFiltersComponent,
    EmptyStateComponent,
    TablePageReportDirective,
    TranslocoDirective,
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
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly packageListService = inject(PackageListService);
  protected readonly columnVisibility = inject(ColumnVisibilityService);

  private readonly activeTranslation = injectActiveTranslation();

  protected readonly rowHeights = TABLE_ROW_HEIGHTS;

  protected readonly pageSize = DEFAULT_PER_PAGE;

  protected readonly formatPkgrel = formatPkgrel;

  protected readonly missingValue = MISSING_VALUE;

  protected readonly filtersActive = computed(
    () => this.packageListService.searchValue() !== '' || this.packageListService.repoName() !== undefined,
  );

  protected stripPrefix(value?: string): string {
    if (!value) return '';
    return value.replace(/(^.*:\/\/|\/$)/g, '');
  }

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly pkgTable = viewChild<Table>('pkgTable');

  readonly search = input<string>();

  protected readonly packageColumns = computed<ColumnDef[]>(() => {
    this.activeTranslation();

    return [
      { key: 'name', label: this.transloco.translate('packageList.columns.name') },
      { key: 'version', label: this.transloco.translate('packageList.columns.version') },
      { key: 'lastUpdated', label: this.transloco.translate('packageList.columns.lastUpdated') },
      {
        key: 'buildClass',
        label: this.transloco.translate('packageList.columns.buildClass'),
        defaultVisible: false,
      },
      {
        key: 'pkgbaseName',
        label: this.transloco.translate('packageList.columns.pkgbaseName'),
        defaultVisible: false,
      },
      { key: 'description', label: this.transloco.translate('packageList.columns.description') },
      { key: 'homepage', label: this.transloco.translate('packageList.columns.homepage') },
      { key: 'repo', label: this.transloco.translate('packageList.columns.repo') },
      { key: 'actions', label: this.transloco.translate('packageList.columns.actions') },
    ];
  });

  protected readonly searchModel = signal({ query: this.packageListService.searchValue() });
  protected readonly searchForm = form(this.searchModel, (schemaPath) => {
    debounce(schemaPath.query, 300);
  });

  constructor() {
    setPageSeo(
      this.transloco.translate('packageList.seo.title'),
      this.transloco.translate('packageList.seo.description'),
      this.transloco.translate('packageList.seo.keywords'),
    );
    this.columnVisibility.register('package-list-table', this.packageColumns());

    effect(() => {
      const q = this.search();
      if (q) this.searchModel.update((model) => ({ ...model, query: q }));
    });

    effect(() => {
      this.applySearch(this.searchForm.query().value());
    });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    this.packageListService.pagination.handleLazyLoad(event);
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
    });
    this.cdr.markForCheck();
  }

  private applySearch(query: string): void {
    const table = this.pkgTable();
    if (table) table.first = 0;
    this.packageListService.setSearch(query);
    void this.router.navigate([], {
      queryParams: { search: query || null },
      queryParamsHandling: 'merge',
    });
  }

  onRepoFilter(repoId: number | null): void {
    const repoName = repoId === null ? null : this.repoNameById(repoId);
    const table = this.pkgTable();
    if (table) table.first = 0;
    this.packageListService.setRepoFilter(repoName);
    void this.router.navigate([], {
      queryParams: { repo: repoName },
      queryParamsHandling: 'merge',
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
    void this.router.navigate(['/stats'], { queryParams: { search: pkg.pkgname, repo: pkg.reponame } });
  }
}

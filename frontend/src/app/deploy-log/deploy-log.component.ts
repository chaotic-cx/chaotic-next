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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounce, FormField, form } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { type Build, BuildStatus, STATUS_LABELS } from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core/message-toast';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { MultiSelectModule } from '@openng/optimus-ui/multiselect';
import { Select } from '@openng/optimus-ui/select';
import { Table, TableLazyLoadEvent, TableModule } from '@openng/optimus-ui/table';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { filter } from 'rxjs';
import { AppService } from '../app.service';
import { ClearFiltersComponent } from '../empty-state/clear-filters.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { FilterBarComponent } from '../filter-bar/filter-bar.component';
import { castTo, formatCpuTime, formatDuration, packageLogRouteFromUrl } from '../functions';
import { injectActiveTranslation } from '../i18n/active-translation';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { BytesPipe } from '../pipes/bytes.pipe';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { statusIconClass } from '../status-icons';
import { ColumnVisibilityComponent, type ColumnDef } from '../table-columns/column-visibility.component';
import { ColumnVisibilityService } from '../table-columns/column-visibility.service';
import { MISSING_VALUE } from '../table-columns/missing-value';
import { TablePageReportDirective } from '../table-page-report.directive';
import { DEFAULT_PER_PAGE } from '../table-pagination';
import { TABLE_ROW_HEIGHTS } from '../table-skeleton/table-row-heights';
import { TableSkeletonRowsComponent } from '../table-skeleton/table-skeleton-rows.component';
import { TitleComponent } from '../title/title.component';
import { DeployLogService } from './deploy-log.service';

const SECONDS_PER_MINUTE = 60;

interface DeployColumn {
  key: string;
  labelKey: string;
  defaultVisible?: boolean;
}

const DEPLOY_COLUMNS: DeployColumn[] = [
  { key: 'pkgname', labelKey: marker('deployLog.columns.pkgname') },
  { key: 'builder', labelKey: marker('deployLog.columns.builder') },
  { key: 'repo', labelKey: marker('deployLog.columns.repo') },
  { key: 'outcome', labelKey: marker('deployLog.columns.outcome') },
  { key: 'failureTags', labelKey: marker('deployLog.columns.failureTags'), defaultVisible: true },
  { key: 'logUrl', labelKey: marker('deployLog.columns.logUrl') },
  { key: 'duration', labelKey: marker('deployLog.columns.duration') },
  /**
   * Resource usage columns stay hidden unless explicitly enabled; most
   * builds predate sampling and would only show "n/a".
   */
  { key: 'peakMemory', labelKey: marker('deployLog.columns.peakMemory'), defaultVisible: false },
  { key: 'cpuTime', labelKey: marker('deployLog.columns.cpuTime'), defaultVisible: false },
  { key: 'diskIo', labelKey: marker('deployLog.columns.diskIo'), defaultVisible: false },
  { key: 'networkIo', labelKey: marker('deployLog.columns.networkIo'), defaultVisible: false },
  { key: 'timestamp', labelKey: marker('deployLog.columns.timestamp') },
  { key: 'actions', labelKey: marker('deployLog.columns.actions') },
];

const STATUS_LABEL_KEYS: Record<BuildStatus, string> = {
  [BuildStatus.SUCCESS]: marker('deployLog.status.success'),
  [BuildStatus.ALREADY_BUILT]: marker('deployLog.status.alreadyBuilt'),
  [BuildStatus.SKIPPED]: marker('deployLog.status.skipped'),
  [BuildStatus.FAILED]: marker('deployLog.status.failure'),
  [BuildStatus.TIMED_OUT]: marker('deployLog.status.timeout'),
  [BuildStatus.CANCELED]: marker('deployLog.status.canceled'),
  [BuildStatus.CANCELED_REQUEUE]: marker('deployLog.status.canceledRequeue'),
  [BuildStatus.SOFTWARE_FAILURE]: marker('deployLog.status.softwareFailure'),
};

@Component({
  selector: 'chaotic-deploy-log',
  imports: [
    FilterBarComponent,
    TableSkeletonRowsComponent,
    LoadErrorComponent,
    DatePipe,
    TableModule,
    InputIcon,
    IconField,
    InputText,
    Select,
    MultiSelectModule,
    BytesPipe,
    RelativeTimePipe,
    TitleComponent,
    FormsModule,
    FormField,
    RouterLink,
    Tooltip,
    ColumnVisibilityComponent,
    ClearFiltersComponent,
    EmptyStateComponent,
    TablePageReportDirective,
    TranslocoDirective,
  ],
  templateUrl: './deploy-log.component.html',
  styleUrl: './deploy-log.component.css',
  providers: [MessageToastService, DeployLogService],
  host: {
    '(document:keydown)': 'focusSearchOnShortcut($event)',
  },
})
export class DeployLogComponent {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly deployLogService = inject(DeployLogService);
  protected readonly columnVisibility = inject(ColumnVisibilityService);

  private readonly activeTranslation = injectActiveTranslation();

  protected readonly rowHeights = TABLE_ROW_HEIGHTS;

  protected readonly pageSize = DEFAULT_PER_PAGE;
  protected readonly deployTable = viewChild<Table>('deployTable');

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly packageLogRouteFromUrl = packageLogRouteFromUrl;

  protected readonly statusLabelKeys = STATUS_LABEL_KEYS;

  protected readonly missingValue = MISSING_VALUE;

  protected readonly filtersActive = this.deployLogService.filtersActive;

  protected buildDuration(minutes: number | undefined): string | null {
    if (!minutes) return null;

    return formatDuration(Math.round(minutes * SECONDS_PER_MINUTE));
  }

  protected buildCpuTime(nanoseconds: number | null | undefined): string | null {
    if (nanoseconds === null || nanoseconds === undefined) return null;

    return formatCpuTime(nanoseconds);
  }

  readonly search = input<string>();

  readonly repo = input<string>();
  readonly builder = input<string | string[]>();
  readonly status = input<string | string[]>();

  protected readonly deployColumns = computed<ColumnDef[]>(() => {
    this.activeTranslation();

    return DEPLOY_COLUMNS.map((column) => ({
      key: column.key,
      label: this.transloco.translate(column.labelKey),
      defaultVisible: column.defaultVisible,
    }));
  });

  protected readonly statusOptions = computed(() => {
    this.activeTranslation();

    return this.deployLogService.statusOptions.map((option) => ({
      ...option,
      label: this.transloco.translate(STATUS_LABEL_KEYS[option.value]),
    }));
  });

  protected readonly searchModel = signal({ query: this.deployLogService.searchValue() });
  protected readonly searchForm = form(this.searchModel, (schemaPath) => {
    debounce(schemaPath.query, 300);
  });

  constructor() {
    this.columnVisibility.register('deploy-log-table', this.deployColumns());
    this.appService.chaoticEvent
      .pipe(
        filter((event) => event.type === 'build'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.deployLogService.reload());

    effect(() => {
      const q = this.search();
      if (q) {
        this.searchModel.update((model) => ({ ...model, query: q }));
      }
    });

    effect(() => {
      this.applySearch(this.searchForm.query().value());
    });

    effect(() => {
      const repo = this.repo();
      if (repo) {
        this.deployLogService.setRepoFilter(repo);
      }
    });

    effect(() => {
      const builder = this.builder();
      if (builder !== undefined) {
        const values = Array.isArray(builder) ? builder : [builder];
        const expanded = values.map((value) => value.trim()).filter(Boolean);
        if (expanded.length > 0) {
          this.deployLogService.setBuilderFilter(expanded);
        }
      }
    });

    effect(() => {
      const status = this.status();
      if (status !== undefined) {
        const labels = Array.isArray(status) ? status : [status];
        const parsed = this.deployLogService.statusByLabels(labels);
        if (parsed) {
          this.deployLogService.setStatusFilter(parsed);
        }
      }
    });
  }

  readonly typed = castTo<Build>;
  readonly statusIconClass = statusIconClass;

  /** Combined disk I/O of a build; null when the build was never sampled. */
  protected diskIoOf(build: Build): number | null {
    const stats = build.resourceStats;
    if (!stats || (stats.diskReadBytes == null && stats.diskWriteBytes == null)) return null;
    return Number(stats.diskReadBytes ?? 0) + Number(stats.diskWriteBytes ?? 0);
  }

  /** Combined network I/O of a build; null when the build was never sampled. */
  protected networkIoOf(build: Build): number | null {
    const stats = build.resourceStats;
    if (!stats || (stats.networkRxBytes == null && stats.networkTxBytes == null)) return null;
    return Number(stats.networkRxBytes ?? 0) + Number(stats.networkTxBytes ?? 0);
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    this.deployLogService.pagination.handleLazyLoad(event);
    this.deployLogService.setSort(
      typeof event.sortField === 'string' ? event.sortField : 'timestamp',
      event.sortOrder ?? -1,
    );
  }

  clear(table: Table) {
    table.clear();
    table.clearState();
    this.searchModel.update((model) => ({ ...model, query: '' }));
    this.deployLogService.setBuilderFilter(undefined);
    this.deployLogService.setRepoFilter(undefined);
    this.deployLogService.setStatusFilter(undefined);
    void this.router.navigate([], {
      queryParams: { search: null, repo: null, builder: null, status: null, pkgname: null },
      queryParamsHandling: 'merge',
    });
    this.cdr.markForCheck();
  }

  onBuilderFilter(value: string[] | null): void {
    const filterValue = value === null || value.length === 0 ? null : value;
    this.applyFilter((v) => this.deployLogService.setBuilderFilter(v as string[] | null), filterValue);
    void this.router.navigate([], {
      queryParams: { builder: filterValue },
      queryParamsHandling: 'merge',
    });
  }

  onRepoFilter(value: string | null): void {
    this.applyFilter((v) => this.deployLogService.setRepoFilter(v), value);
    void this.router.navigate([], {
      queryParams: { repo: value ?? null },
      queryParamsHandling: 'merge',
    });
  }

  onStatusFilter(value: BuildStatus[] | null): void {
    const filterValue = value === null || value.length === 0 ? null : value;
    this.applyFilter((v) => this.deployLogService.setStatusFilter(v as BuildStatus[] | null), filterValue);
    void this.router.navigate([], {
      queryParams: { status: filterValue === null ? null : filterValue.map((status) => STATUS_LABELS[status]) },
      queryParamsHandling: 'merge',
    });
  }

  private applySearch(query: string): void {
    const table = this.deployTable();
    if (table) {
      table.first = 0;
    }
    this.deployLogService.setSearch(query);
    void this.router.navigate([], {
      queryParams: { search: query || null, pkgname: null },
      queryParamsHandling: 'merge',
    });
    this.cdr.markForCheck();
  }

  protected focusSearchOnShortcut(event: KeyboardEvent): void {
    if (!event.ctrlKey || event.key.toLowerCase() !== 'f') return;
    event.preventDefault();
    this.searchInput()?.nativeElement.focus();
    this.searchInput()?.nativeElement.select();
  }

  openDetail(build: Build) {
    void this.router.navigate(['/stats'], {
      queryParams: { search: build.pkgbase.pkgname, repo: build.repo?.name },
    });
  }

  private applyFilter<T>(setFilter: (value: T | null) => void, value: T | null): void {
    const table = this.deployTable();
    if (table) {
      table.first = 0;
    }
    setFilter(value);
  }
}

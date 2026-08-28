import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounce, FormField, form } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { type Build, BuildStatus, STATUS_LABELS } from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core';
import { Button } from '@openng/optimus-ui/button';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Select } from '@openng/optimus-ui/select';
import { Table, TableLazyLoadEvent, TableModule } from '@openng/optimus-ui/table';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { filter } from 'rxjs';
import { AppService } from '../app.service';
import { castTo, packageLogRouteFromUrl } from '../functions';
import { BytesPipe } from '../pipes/bytes.pipe';
import { CpuTimePipe } from '../pipes/cpu-time.pipe';
import { DurationPipe } from '../pipes/duration.pipe';
import { LocaleDatePipe } from '../pipes/locale-date.pipe';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { ColumnVisibilityComponent, type ColumnDef } from '../table-columns/column-visibility.component';
import { ColumnVisibilityService } from '../table-columns/column-visibility.service';
import { TitleComponent } from '../title/title.component';
import { DeployLogService } from './deploy-log.service';

@Component({
  selector: 'chaotic-deploy-log',
  imports: [
    CommonModule,
    TableModule,
    Button,
    InputIcon,
    IconField,
    InputText,
    Select,
    DurationPipe,
    BytesPipe,
    CpuTimePipe,
    RelativeTimePipe,
    LocaleDatePipe,
    TitleComponent,
    FormsModule,
    FormField,
    RouterLink,
    Tooltip,
    ColumnVisibilityComponent,
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
  protected readonly deployLogService = inject(DeployLogService);
  protected readonly columnVisibility = inject(ColumnVisibilityService);
  protected readonly deployTable = viewChild<Table>('deployTable');

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly packageLogRouteFromUrl = packageLogRouteFromUrl;

  readonly search = input<string>();

  readonly repo = input<string>();
  readonly builder = input<string>();
  readonly status = input<string>();

  protected readonly deployColumns: ColumnDef[] = [
    { key: 'pkgname', label: 'Package name' },
    { key: 'builder', label: 'Builder' },
    { key: 'repo', label: 'Repository' },
    { key: 'outcome', label: 'Outcome' },
    { key: 'logUrl', label: 'Log URL' },
    { key: 'duration', label: 'Duration' },
    // Resource usage columns stay hidden unless explicitly enabled; most
    // builds predate sampling and would only show "n/a".
    { key: 'peakMemory', label: 'Peak memory', defaultVisible: false },
    { key: 'cpuTime', label: 'CPU time', defaultVisible: false },
    { key: 'diskIo', label: 'Disk I/O', defaultVisible: false },
    { key: 'networkIo', label: 'Network I/O', defaultVisible: false },
    { key: 'timestamp', label: 'Time of finish' },
    { key: 'actions', label: 'Details' },
  ];

  protected readonly searchModel = signal({ query: this.deployLogService.searchValue() });
  protected readonly searchForm = form(this.searchModel, (schemaPath) => {
    debounce(schemaPath.query, 300);
  });

  constructor() {
    this.columnVisibility.register('deploy-log-table', this.deployColumns);
    this.appService.chaoticEvent
      .pipe(
        filter((event) => event.type === 'build'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.deployLogService.reload());

    effect(() => {
      const q = this.search();
      if (q) this.searchModel.update((model) => ({ ...model, query: q }));
    });

    effect(() => {
      this.applySearch(this.searchForm.query().value());
    });

    effect(() => {
      const repo = this.repo();
      if (repo) this.deployLogService.setRepoFilter(repo);
    });

    effect(() => {
      const builder = this.builder();
      if (builder) this.deployLogService.setBuilderFilter(builder);
    });

    effect(() => {
      const status = this.status();
      if (status) this.deployLogService.setStatusFilter(this.deployLogService.statusByLabel(status));
    });
  }

  readonly typed = castTo<Build>;

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
      queryParams: { search: null, repo: null, builder: null, status: null },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
    this.cdr.markForCheck();
  }

  onBuilderFilter(value: string | null): void {
    this.applyFilter((v) => this.deployLogService.setBuilderFilter(v), value);
    void this.router.navigate([], {
      queryParams: { builder: value ?? null },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
  }

  onRepoFilter(value: string | null): void {
    this.applyFilter((v) => this.deployLogService.setRepoFilter(v), value);
    void this.router.navigate([], {
      queryParams: { repo: value ?? null },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
  }

  onStatusFilter(value: BuildStatus | null): void {
    this.applyFilter((v) => this.deployLogService.setStatusFilter(v), value);
    void this.router.navigate([], {
      queryParams: { status: value === null ? null : STATUS_LABELS[value] },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
  }

  private applySearch(query: string): void {
    const table = this.deployTable();
    if (table) table.first = 0;
    this.deployLogService.setSearch(query);
    void this.router.navigate([], {
      queryParams: { search: query || null },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
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
    if (table) table.first = 0;
    setFilter(value);
  }
}

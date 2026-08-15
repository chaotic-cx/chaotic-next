import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, effect, inject, input, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { type Build, BuildStatus } from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core';
import { FilterMetadata } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Select } from '@openng/optimus-ui/select';
import { Table, TableLazyLoadEvent, TableModule } from '@openng/optimus-ui/table';
import { filter } from 'rxjs';
import { AppService } from '../app.service';
import { DatatableUnsetRoundingDirective } from '../directives/datatable-unset-rounding.directive';
import { castTo } from '../functions';
import { DurationPipe } from '../pipes/duration.pipe';
import { LogurlPipe } from '../pipes/logurl.pipe';
import { TitleComponent } from '../title/title.component';
import { DeployLogService } from './deploy-log.service';

@Component({
  selector: 'chaotic-deploy-log',
  imports: [
    CommonModule,
    DatatableUnsetRoundingDirective,
    TableModule,
    Button,
    InputIcon,
    IconField,
    InputText,
    Select,
    LogurlPipe,
    DurationPipe,
    TitleComponent,
    FormsModule,
  ],
  templateUrl: './deploy-log.component.html',
  styleUrl: './deploy-log.component.css',
  providers: [MessageToastService],
})
export class DeployLogComponent {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);

  protected readonly deployLogService = inject(DeployLogService);
  protected readonly deployTable = viewChild<Table>('deployTable');

  readonly search = input<string>();

  constructor() {
    this.appService.chaoticEvent
      .pipe(
        filter((event) => event.type === 'build'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.deployLogService.reload());

    effect(() => {
      const q = this.search();
      if (q) {
        this.deployLogService.setSearch(q);
      }
    });
  }

  readonly typed = castTo<Build>;

  onLazyLoad(event: TableLazyLoadEvent): void {
    this.deployLogService.setPage(event.first ?? 0, event.rows ?? 25);
    this.deployLogService.setSort(
      typeof event.sortField === 'string' ? event.sortField : 'timestamp',
      event.sortOrder ?? -1,
    );
    this.deployLogService.setPkgnameFilter(this.extractPkgnameFilter(event.filters));
  }

  clear(table: Table) {
    table.clear();
    this.deployLogService.setSearch('');
    this.deployLogService.clearPkgnameFilter();
    this.deployLogService.setBuilderFilter(undefined);
    this.deployLogService.setRepoFilter(undefined);
    this.deployLogService.setStatusFilter(undefined);
    void this.router.navigate([], { queryParams: { search: '' } });
    this.cdr.markForCheck();
  }

  onBuilderFilter(value: string | null): void {
    this.applyFilter((v) => this.deployLogService.setBuilderFilter(v), value);
  }

  onRepoFilter(value: string | null): void {
    this.applyFilter((v) => this.deployLogService.setRepoFilter(v), value);
  }

  onStatusFilter(value: BuildStatus | null): void {
    this.applyFilter((v) => this.deployLogService.setStatusFilter(v), value);
  }

  globalFilter(target: EventTarget | null) {
    if (!(target instanceof HTMLInputElement)) return;
    this.deployLogService.setSearch(target.value);
    void this.router.navigate([], { queryParams: { search: target.value } });
    this.cdr.markForCheck();
  }

  openDetail(build: Build) {
    void this.router.navigate(['/stats'], { queryParams: { search: build.pkgbase.pkgname } });
  }

  private extractPkgnameFilter(
    filters?: Record<string, FilterMetadata | FilterMetadata[] | undefined>,
  ): string | undefined {
    const entry = filters?.['pkgbase.pkgname'];
    const meta = Array.isArray(entry) ? entry[0] : entry;
    const raw = meta?.value;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  }

  private applyFilter<T>(setFilter: (value: T | null) => void, value: T | null): void {
    const table = this.deployTable();
    if (table) table.first = 0;
    setFilter(value);
  }
}

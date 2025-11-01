import { Build } from '@./shared-lib';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { Button } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Table, TableModule } from 'primeng/table';
import { filter } from 'rxjs';
import { AppService } from '../app.service';
import { DurationPipe } from '../pipes/duration.pipe';
import { LogurlPipe } from '../pipes/logurl.pipe';
import { OutcomePipe } from '../pipes/outcome.pipe';
import { TitleComponent } from '../title/title.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
    LogurlPipe,
    DurationPipe,
    TitleComponent,
    FormsModule,
  ],
  templateUrl: './deploy-log.component.html',
  styleUrl: './deploy-log.component.css',
  providers: [MessageToastService, OutcomePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeployLogComponent implements OnInit, AfterViewInit {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly deployLogService = inject(DeployLogService);
  protected readonly deployTable = viewChild<Table>('deployTable');

  constructor() {
    this.appService.chaoticEvent
      .pipe(
        filter((event) => event.type === 'build'),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.deployLogService.getDeployments(true));
  }

  ngOnInit() {
    this.appService.updateSeoTags(
      this.meta,
      'Deploy log',
      'Deploy log for the Chaotic-AUR repository',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR deploy log',
      this.router.url,
    );

    if (this.route.snapshot.queryParams['amount']) {
      this.deployLogService.amount.set(this.route.snapshot.queryParams['amount']);
      this.cdr.markForCheck();
    }

    this.deployLogService.getDeployments();
  }

  ngAfterViewInit() {
    if (this.route.snapshot.queryParams['search']) {
      this.deployTable()!.filterGlobal(this.route.snapshot.queryParams['search'], 'contains');
      this.deployLogService.searchValue.set(this.route.snapshot.queryParams['search']);
    }
    this.unsetRounding();
  }

  clear(table: Table) {
    table.clear();
    this.deployLogService.searchValue.set('');
    void this.router.navigate([], { queryParams: { search: '' } });
    this.cdr.markForCheck();
  }

  globalFilter(target: EventTarget | null) {
    if (!target) return;
    const input = target as HTMLInputElement;
    this.deployTable()!.filterGlobal(input.value, 'contains');
    void this.router.navigate([], { queryParams: { search: input.value } });
    this.cdr.markForCheck();
  }

  typed(value: any): Build {
    return value;
  }

  /**
   * Remove the border radius from the datatable container elements.
   */
  private unsetRounding(): void {
    const elements = document.querySelectorAll('.p-datatable-table-container');
    for (const element of Array.from(elements)) {
      if (element instanceof HTMLElement) {
        element.style.borderRadius = '0';
      }
    }
  }
}

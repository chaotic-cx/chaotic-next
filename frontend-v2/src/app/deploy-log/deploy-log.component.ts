import { Component, inject, OnInit, signal, ViewChild } from '@angular/core';
import { Table, TableModule } from 'primeng/table';
import { AppService } from '../app.service';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';
import { retry } from 'rxjs';
import { Button } from 'primeng/button';
import { InputIcon } from 'primeng/inputicon';
import { IconField } from 'primeng/iconfield';
import { InputText } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { Build } from '@./shared-lib';
import { OutcomePipe } from '../pipes/outcome.pipe';
import { LogurlPipe } from '../pipes/logurl.pipe';
import { DurationPipe } from '../pipes/duration.pipe';

@Component({
  selector: 'chaotic-deploy-log',
  imports: [CommonModule, TableModule, Button, InputIcon, IconField, InputText, ToastModule, LogurlPipe, DurationPipe],
  templateUrl: './deploy-log.component.html',
  styleUrl: './deploy-log.component.css',
  providers: [MessageService, OutcomePipe],
})
export class DeployLogComponent implements OnInit {
  packageList: Build[] = [];
  loading = true;
  searchValue: string | undefined;
  amount = signal<number>(4000);
  outcomePipe = inject(OutcomePipe);

  @ViewChild('pkgTable') pkgTable!: Table;

  constructor(
    private appService: AppService,
    private messageService: MessageService,
  ) {}

  ngOnInit() {
    this.appService
      .getPackageBuilds(this.amount())
      .pipe(retry({ delay: 2000 }))
      .subscribe({
        next: (data: Build[]) => {
          data.map((build) => {
            build.statusText = this.outcomePipe.transform(build.status);
            // Logs expire after 7 days of being stored inside Redis
            if (new Date(build.timestamp).getTime() + 7 * 24 * 60 * 60 * 1000 < Date.now()) {
              build.logUrl = 'purged';
            }
            return build;
          });
          this.packageList = data;
          this.loading = false;
        },
        error: (err) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to build list',
          });
          console.error(err);
          this.loading = false;
        },
      });
  }

  clear(table: Table) {
    table.clear();
    this.searchValue = '';
  }

  globalFilter(target: EventTarget | null) {
    if (!target) return;
    const input = target as HTMLInputElement;
    this.pkgTable.filterGlobal(input.value, 'contains');
  }

  typed(value: any): Build {
    return value;
  }
}

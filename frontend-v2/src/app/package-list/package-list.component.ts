import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { Table, TableModule } from 'primeng/table';
import { AppService } from '../app.service';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { TagModule } from 'primeng/tag';
import { DatePipe, NgIf } from '@angular/common';
import { Button } from 'primeng/button';
import { retry } from 'rxjs';
import { Package } from '@./shared-lib';
import { MessageToastService } from '@garudalinux/core';

@Component({
  selector: 'chaotic-package-list',
  imports: [
    TableModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    FormsModule,
    MultiSelectModule,
    TagModule,
    DatePipe,
    Button,
    NgIf,
  ],
  templateUrl: './package-list.component.html',
  styleUrl: './package-list.component.css',
  providers: [MessageToastService],
})
export class PackageListComponent implements OnInit {
  packageList: any;
  loading = true;
  searchValue: string | undefined;

  @ViewChild('pkgTable') pkgTable!: Table;

  private readonly messageToastService = inject(MessageToastService);
  private readonly appService = inject(AppService);

  async ngOnInit() {
    this.appService
      .getPackageList()
      .pipe(retry({ delay: 2000 }))
      .subscribe({
        next: (data) => {
          this.packageList = data;
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to package list');
          console.error(err);
        },
        complete: () => {
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

  typed(value: any): Package {
    return value;
  }
}

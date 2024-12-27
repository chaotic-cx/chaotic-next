import { Component, OnInit, ViewChild } from '@angular/core';
import { Table, TableModule } from 'primeng/table';
import { AppService } from '../app.service';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { TagModule } from 'primeng/tag';
import { DatePipe } from '@angular/common';
import { Button } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { retry } from 'rxjs';

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
  ],
  templateUrl: './package-list.component.html',
  styleUrl: './package-list.component.css',
  providers: [MessageService],
})
export class PackageListComponent implements OnInit {
  packageList: any;
  loading = true;

  @ViewChild('pkgTable') pkgTable!: Table;

  constructor(
    private appService: AppService,
    private messageService: MessageService,
  ) {}

  async ngOnInit() {
    this.appService
      .getPackageList()
      .pipe(retry({ delay: 2000 }))
      .subscribe({
        next: (data) => {
          this.packageList = data;
        },
        error: (err) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to package list',
          });
          console.error(err);
        },
      });
    this.loading = false;
  }

  searchValue: string | undefined;

  clear(table: Table) {
    table.clear();
    this.searchValue = '';
  }

  globalFilter(target: EventTarget | null) {
    if (!target) return;
    const input = target as HTMLInputElement;
    this.pkgTable.filterGlobal(input.value, 'contains');
  }
}

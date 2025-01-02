import { AfterViewInit, Component, inject, LOCALE_ID, OnInit, ViewChild } from '@angular/core';
import { Table, TableModule } from 'primeng/table';
import { AppService } from '../app.service';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { TagModule } from 'primeng/tag';
import { DatePipe, NgClass, NgIf } from '@angular/common';
import { Button, ButtonDirective } from 'primeng/button';
import { retry } from 'rxjs';
import { Package } from '@./shared-lib';
import { MessageToastService } from '@garudalinux/core';
import { StripPrefixPipe } from '../pipes/strip-prefix.pipe';
import { APP_CONFIG } from 'frontend-v2/src/environments/app-config.token';
import { EnvironmentModel } from '../../environments/environment.model';
import { TitleComponent } from '../title/title.component';
import { ActivatedRoute, Router } from '@angular/router';

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
    StripPrefixPipe,
    ButtonDirective,
    NgClass,
    TitleComponent,
  ],
  templateUrl: './package-list.component.html',
  styleUrl: './package-list.component.css',
  providers: [MessageToastService, { provide: LOCALE_ID, useValue: 'en-GB' }],
})
export class PackageListComponent implements OnInit, AfterViewInit {
  loading = true;
  packageList!: Package[];
  searchValue: string = '';

  @ViewChild('pkgTable') pkgTable!: Table;

  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit() {
    this.appService
      .getPackageList()
      .pipe(retry({ delay: 5000, count: 3 }))
      .subscribe({
        next: (data: Package[]) => {
          this.packageList = data.filter((pkg) => pkg.version);
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

  ngAfterViewInit() {
    if (this.route.snapshot.queryParams['search']) {
      this.pkgTable.filterGlobal(this.route.snapshot.queryParams['search'], 'contains');
      this.searchValue = this.route.snapshot.queryParams['search'];
    }
  }

  clear(table: Table) {
    table.clear();
    this.searchValue = '';
  }

  globalFilter(target: EventTarget | null) {
    if (!target) return;
    const input = target as HTMLInputElement;
    this.pkgTable.filterGlobal(input.value, 'contains');
    void this.router.navigate([], { queryParams: { search: input.value } });
  }

  typed(value: any): Package {
    return value;
  }

  openPkgbuild(pkg: Package) {
    window.open(`${this.appConfig.repoUrl}/${pkg.pkgname}`, '_blank');
  }
}

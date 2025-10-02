import { Package } from '@./shared-lib';
import { DatePipe, NgClass } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  LOCALE_ID,
  OnInit,
  ViewChild,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { Button, ButtonDirective } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { retry } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';
import { EnvironmentModel } from '../../environments/environment.model';
import { AppService } from '../app.service';
import { StripPrefixPipe } from '../pipes/strip-prefix.pipe';
import { TitleComponent } from '../title/title.component';

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
    StripPrefixPipe,
    ButtonDirective,
    NgClass,
    TitleComponent,
  ],
  templateUrl: './package-list.component.html',
  styleUrl: './package-list.component.css',
  providers: [MessageToastService, { provide: LOCALE_ID, useValue: 'en-GB' }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PackageListComponent implements OnInit, AfterViewInit {
  readonly loading = signal<boolean>(true);
  packageList!: (Package & { reponame: string })[];
  searchValue = '';

  @ViewChild('pkgTable') pkgTable!: Table;

  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit() {
    this.appService.updateSeoTags(
      this.meta,
      'Package list',
      'List of all packages available in the Chaotic-AUR repository',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR package list',
      this.router.url,
    );

    this.appService
      .getPackageList()
      .pipe(retry({ delay: 5000, count: 3 }))
      .subscribe({
        next: (data: (Package & { reponame: string })[]) => {
          this.packageList = data.filter((pkg) => pkg.version);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to package list');
          console.error(err);
        },
        complete: () => {
          this.loading.set(false);
        },
      });
  }

  ngAfterViewInit() {
    if (this.route.snapshot.queryParams['search']) {
      this.pkgTable.filterGlobal(this.route.snapshot.queryParams['search'], 'contains');
      this.searchValue = this.route.snapshot.queryParams['search'];
      this.cdr.markForCheck();
    }
    this.unsetRounding();
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

  clear(table: Table) {
    table.clear();
    this.searchValue = '';
    this.cdr.markForCheck();
  }

  globalFilter(target: EventTarget | null) {
    if (!target) return;
    const input = target as HTMLInputElement;
    this.pkgTable.filterGlobal(input.value, 'contains');
    void this.router.navigate([], { queryParams: { search: input.value } });
  }

  typed(value: any): Package & { reponame: string } {
    return value;
  }

  openPkgbuild(pkg: Package & { reponame: string }) {
    const url: string = pkg.reponame === 'chaotic-aur' ? this.appConfig.repoUrl : this.appConfig.repoUrlGaruda;
    window.open(`${url}/${pkg.pkgname}`, '_blank');
  }
}

import { Component, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { FilterService } from 'primeng/api';
import { AppService } from '../app.service';
import { MessageToastService } from '@garudalinux/core';
import { Package } from '@./shared-lib';
import { retry } from 'rxjs';
import { TableModule } from 'primeng/table';
import { PackageDetailKeyPipe } from '../pipes/package-detail-key.pipe';
import { UnixDatePipe } from '../pipes/unix-date.pipe';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'chaotic-search-package',
  imports: [CommonModule, AutoComplete, TableModule, PackageDetailKeyPipe, UnixDatePipe],
  templateUrl: './search-package.component.html',
  styleUrl: './search-package.component.css',
  providers: [FilterService],
})
export class SearchPackageComponent implements OnInit {
  suggestionPool = signal<string[]>([]);
  currentSuggestions: string[] = [];
  packageData!: Package;
  initialSearchDone = false;
  loading = signal<boolean>(false);

  @ViewChild('autoComplete') autoComplete!: AutoComplete;

  data: { key: string; value: any }[] = [];

  private readonly appService = inject(AppService);
  private readonly filterService = inject(FilterService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    this.getSuggestions();

    this.route.queryParams.subscribe((params) => {
      if (params['search'] && /^[0-9|a-zA-Z-]*$/.test(params['search'])) {
        this.updateDisplay(params['search']);
      }
    });
  }

  search(event: AutoCompleteCompleteEvent) {
    if (event.query.length < 3) return;

    if (/^[0-9|a-zA-Z-]*$/.test(event.query)) {
      this.currentSuggestions = this.suggestionPool().filter((name) =>
        this.filterService.filters['contains'](name, event.query),
      );
      this.autoComplete.inputStyleClass = '';
      void this.router.navigate(['/stats'], { queryParams: { search: event.query } });
    } else {
      this.autoComplete.inputStyleClass = 'ng-invalid ng-dirty';
    }
  }

  getSuggestions() {
    this.appService
      .getPackageList()
      .pipe(retry({ delay: 2000 }))
      .subscribe({
        next: (data) => {
          this.suggestionPool.set(data.map((pkg) => pkg.pkgname));
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load suggestions');
          console.error(err);
        },
      });
  }

  updateDisplay(query: string): void {
    this.loading.set(true);
    this.data = [];

    this.appService
      .getPackage(query)
      .pipe(retry({ delay: 2000 }))
      .subscribe({
        next: (result) => {
          this.packageData = result;
          const data = this.packageData as Record<string, any>;
          for (const key in data) {
            if (data[key] && typeof data[key] !== 'object') {
              this.data.push({ key, value: data[key] });
            } else if (data[key] && typeof data[key] === 'object') {
              for (const innerKey in data[key]) {
                this.data.push({ key: innerKey, value: data[key][innerKey] });
              }
            }
          }

          this.initialSearchDone = true;
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load package metrics');
          console.error(err);
        },
        complete: () => {
          this.loading.set(false);
        },
      });
    this.appService.getSpecificPackageMetrics(query).subscribe({
      next: (result) => {
        this.data.push({ key: 'downloads', value: result.downloads });
      },
      error: (err) => {
        this.messageToastService.error('Error', 'Failed to load package data');
        console.error(err);
      },
    });
  }
}

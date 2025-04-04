import { Package } from '@./shared-lib';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { FilterService } from 'primeng/api';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { TableModule } from 'primeng/table';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { PackageDetailKeyPipe } from '../pipes/package-detail-key.pipe';
import { UnixDatePipe } from '../pipes/unix-date.pipe';

@Component({
  selector: 'chaotic-search-package',
  imports: [CommonModule, AutoComplete, TableModule, PackageDetailKeyPipe, UnixDatePipe],
  templateUrl: './search-package.component.html',
  styleUrl: './search-package.component.css',
  providers: [FilterService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPackageComponent implements OnInit {
  suggestionPool = signal<string[]>([]);
  currentSuggestions: string[] = [];
  packageData!: Package;
  initialSearchDone = false;

  @ViewChild('autoComplete') autoComplete!: AutoComplete;

  data: { key: string; value: any }[] = [];

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly filterService = inject(FilterService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    this.getSuggestions();

    this.appService.updateSeoTags(
      this.meta,
      'Package search',
      'Search packages available in the Chaotic-AUR repository',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR package search',
      this.router.url,
    );

    this.route.queryParams.subscribe((params) => {
      if (params['search'] && /^[0-9|a-zA-Z-]*$/.test(params['search'])) {
        this.updateDisplay(params['search']);
        this.cdr.markForCheck();
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
      this.cdr.markForCheck();
    } else {
      this.autoComplete.inputStyleClass = 'ng-invalid ng-dirty';
      this.cdr.markForCheck();
    }
  }

  getSuggestions() {
    this.appService
      .getPackageList()
      .pipe(retry({ delay: 5000, count: 3 }))
      .subscribe({
        next: (data) => {
          this.suggestionPool.set(data.map((pkg) => pkg.pkgname));
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load suggestions');
          console.error(err);
        },
      });
  }

  updateDisplay(query: string): void {
    this.data = [];

    this.appService
      .getPackage(query)
      .pipe(retry({ delay: 5000, count: 3 }))
      .subscribe({
        next: (result) => {
          this.packageData = result;
          const data = this.packageData as Record<string, any>;

          data['version'] = `${data['version']}-${data['pkgrel']}`;
          delete data['pkgrel'];

          for (const key in data) {
            if (key === 'isActive') continue;
            if (data[key] && typeof data[key] !== 'object') {
              this.data.push({ key, value: data[key] });
            } else if (data[key] && typeof data[key] === 'object') {
              for (const innerKey in data[key]) {
                this.data.push({ key: innerKey, value: data[key][innerKey] });
              }
            }
          }
          this.initialSearchDone = true;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load package metrics');
          console.error(err);
        },
      });
    this.appService.getSpecificPackageMetrics(query).subscribe({
      next: (result) => {
        if (this.data.filter((d) => d.key === 'downloads')) {
          const key: number = this.data.findIndex((d) => d.key === 'downloads');
          this.data[key].value = result.downloads;
        } else {
          this.data.push({ key: 'downloads', value: result.downloads });
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.messageToastService.error('Error', 'Failed to load package data');
        console.error(err);
      },
    });
  }
}

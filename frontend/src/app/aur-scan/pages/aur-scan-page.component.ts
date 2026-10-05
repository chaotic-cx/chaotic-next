import { DecimalPipe } from '@angular/common';
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounce, form, pattern } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { PKGNAME_PATTERN } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AutoComplete } from '@openng/optimus-ui/autocomplete';
import { AppService } from '../../app.service';
import { createSuggestions } from '../../autocomplete-suggestions';
import { setPageSeo } from '../../functions';
import { TitleComponent } from '../../title/title.component';
import { AurScanResultComponent } from '../aur-scan-result.component';
import { AurScanService } from '../aur-scan.service';

const MIN_QUERY_LENGTH = 3;

@Component({
  selector: 'chaotic-aur-scan-page',
  imports: [AutoComplete, AurScanResultComponent, DecimalPipe, FormsModule, TitleComponent, TranslocoDirective],
  templateUrl: './aur-scan-page.component.html',
  styleUrl: './aur-scan-page.css',
})
export class AurScanPageComponent {
  private readonly appService = inject(AppService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly aurScanService = inject(AurScanService);

  readonly search = input<string>();

  protected readonly currentPackageName = signal('');
  protected readonly metrics = this.aurScanService.metrics;
  protected readonly minQueryLength = MIN_QUERY_LENGTH;

  protected readonly searchModel = signal({ query: '' });
  protected readonly searchForm = form(this.searchModel, (schemaPath) => {
    debounce(schemaPath.query, 300);
    pattern(schemaPath.query, PKGNAME_PATTERN, {
      message: this.transloco.translate('aurScan.page.invalidPackageName'),
    });
  });

  protected readonly suggestions = createSuggestions({
    minLength: MIN_QUERY_LENGTH,
    request: (query) => this.appService.getAurSuggestions(query),
    toNames: (names: string[]) => names,
  });

  /** Last ?search= value seen by the route effect; guards against re-applying stale URLs. */
  private lastSeenRoutePackage = '';

  constructor() {
    setPageSeo(
      this.transloco.translate('aurScan.page.seo.title'),
      this.transloco.translate('aurScan.page.seo.description'),
      this.transloco.translate('aurScan.page.seo.keywords'),
    );
    this.aurScanService.loadMetrics();

    effect(() => {
      const linked = (this.search() ?? '').trim();
      if (!linked || linked === this.lastSeenRoutePackage) return;

      /**
       * Consume every route value exactly once, then decide outside the
       * reactive context: currentPackageName and the model change below would
       * otherwise re-run this effect while the URL still holds the old value,
       * making the stale value win over fresher user input.
       */
      this.lastSeenRoutePackage = linked;
      untracked(() => {
        if (this.currentPackageName() === linked) return;
        if (!this.searchForm.query().valid()) return;
        this.searchModel.update((model) => ({ ...model, query: linked }));
        this.currentPackageName.set(linked);
        void this.syncQueryParam(linked);
      });
    });

    effect(() => {
      const query = (this.searchModel().query ?? '').trim();
      if (!query) {
        this.clearResults();
      }
    });
  }

  protected selectPackage(name: string): void {
    const pkg = name.trim();
    if (!pkg || !this.searchForm.query().valid()) return;

    /**
     * Mark the route value as handled before navigating so the returning
     * parameter update cannot be mistaken for a new deep link.
     */
    this.lastSeenRoutePackage = pkg;
    this.searchModel.update((model) => ({ ...model, query: pkg }));
    this.currentPackageName.set(pkg);
    void this.syncQueryParam(pkg);
  }

  protected onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.scanQuery();
    }
  }

  protected scanQuery(): void {
    const query = this.searchModel().query.trim();
    if (query.length >= MIN_QUERY_LENGTH && this.searchForm.query().valid()) {
      this.selectPackage(query);
    }
  }

  private syncQueryParam(pkg: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: pkg },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private clearResults(): void {
    this.lastSeenRoutePackage = '';
    this.currentPackageName.set('');
    if (this.route.snapshot.queryParamMap.has('search')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { search: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }
}

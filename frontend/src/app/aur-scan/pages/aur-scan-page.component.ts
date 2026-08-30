import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounce, form, pattern } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { AutoComplete, AutoCompleteCompleteEvent } from '@openng/optimus-ui/autocomplete';
import { Card } from '@openng/optimus-ui/card';
import { firstValueFrom } from 'rxjs';
import { PKGNAME_PATTERN } from '@chaotic-next/shared-lib';
import { setPageSeo } from '../../functions';
import { AppService } from '../../app.service';
import { TitleComponent } from '../../title/title.component';
import { AurScanResultComponent } from '../aur-scan-result.component';
import { AurScanService } from '../aur-scan.service';

@Component({
  selector: 'chaotic-aur-scan-page',
  imports: [AutoComplete, Card, FormsModule, TitleComponent, AurScanResultComponent],
  styleUrl: './aur-scan-page.css',
  templateUrl: './aur-scan-page.component.html',
})
export class AurScanPageComponent {
  private readonly http = inject(HttpClient);
  private readonly appService = inject(AppService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly aurScanService = inject(AurScanService);

  readonly search = input<string>();

  readonly subtitle =
    'Scan AUR packages for potentially malicious and suspicious content and other indicators for a problematic PKGBUILD.';

  protected readonly currentPackageName = signal('');
  protected readonly hasResults = computed(() => this.currentPackageName() !== '');

  protected readonly searchModel = signal({ query: '' });
  protected readonly searchForm = form(this.searchModel, (schemaPath) => {
    debounce(schemaPath.query, 300);
    pattern(schemaPath.query, PKGNAME_PATTERN, { message: 'Invalid package name' });
  });

  protected readonly suggestions = signal<string[]>([]);
  private suggestionGeneration = 0;

  /** Last ?search= value seen by the route effect; guards against re-applying stale URLs. */
  private lastSeenRoutePackage = '';

  constructor() {
    setPageSeo(
      'AUR package scan · Chaotic-AUR',
      'Scan AUR packages for malicious PKGBUILD content, suspicious URLs and risky maintainership changes',
      'Chaotic-AUR, AUR, security, PKGBUILD, VirusTotal, scan',
    );
    effect(() => {
      const linked = (this.search() ?? '').trim();
      if (!linked || linked === this.lastSeenRoutePackage) return;

      // Consume every route value exactly once, then decide outside the
      // reactive context: currentPackageName and the model change below would
      // otherwise re-run this effect while the URL still holds the old value,
      // making the stale value win over fresher user input.
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
      if (!query) this.clearResults();
    });
  }

  async searchSuggestions(event: AutoCompleteCompleteEvent): Promise<void> {
    const query = event.query.trim();
    if (query.length < 3) {
      this.suggestions.set([]);
      return;
    }
    const generation = ++this.suggestionGeneration;
    try {
      const request = this.appService.getAurSuggestions(query);
      const result = await firstValueFrom(this.http.get<string[]>(request.url, { params: request.params }));
      if (generation !== this.suggestionGeneration) return;
      this.suggestions.set(result);
    } catch {
      if (generation === this.suggestionGeneration) this.suggestions.set([]);
    }
  }

  protected selectPackage(name: string): void {
    const pkg = name.trim();
    if (!pkg || !this.searchForm.query().valid()) return;

    // Mark the route value as handled before navigating so the returning
    // parameter update cannot be mistaken for a new deep link.
    this.lastSeenRoutePackage = pkg;
    this.searchModel.update((model) => ({ ...model, query: pkg }));
    this.currentPackageName.set(pkg);
    void this.syncQueryParam(pkg);
  }

  protected onKeyUp(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    const query = this.searchModel().query.trim();
    if (query.length >= 3 && this.searchForm.query().valid()) this.selectPackage(query);
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

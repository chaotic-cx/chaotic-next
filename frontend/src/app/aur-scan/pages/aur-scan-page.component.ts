import { httpResource } from '@angular/common/http';
import { Component, computed, ElementRef, effect, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { debounce, form, FormField, pattern } from '@angular/forms/signals';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { Card } from '@openng/optimus-ui/card';
import { InputText } from '@openng/optimus-ui/inputtext';
import { AppService } from '../../app.service';
import { TitleComponent } from '../../title/title.component';
import { AurScanResultComponent } from '../aur-scan-result.component';
import { AurScanService } from '../aur-scan.service';
import { PACKAGE_NAME_PATTERN } from '../../functions';
import { SearchSuggestionsComponent } from '../../search-suggestions/search-suggestions.component';

@Component({
  selector: 'chaotic-aur-scan-page',
  imports: [Card, FormField, InputText, TitleComponent, AurScanResultComponent, SearchSuggestionsComponent],
  styleUrl: './aur-scan-page.css',
  templateUrl: './aur-scan-page.component.html',
})
export class AurScanPageComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly aurScanService = inject(AurScanService);

  readonly search = input<string>();

  readonly subtitle =
    'Scan AUR packages for malicious PKGBUILD content, suspicious URLs and risky maintainership changes.';

  protected readonly currentPackageName = signal('');
  protected readonly hasResults = computed(() => this.currentPackageName() !== '');

  protected readonly searchModel = signal({ query: '' });
  protected readonly searchForm = form(this.searchModel, (schemaPath) => {
    debounce(schemaPath.query, 300);
    pattern(schemaPath.query, PACKAGE_NAME_PATTERN, { message: 'Invalid package name' });
  });

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly suggestionsVisible = signal(false);

  private readonly suggestionsResource = httpResource<string[]>(() => {
    const query = this.searchModel().query.trim();
    return query.length >= 3 ? this.appService.getAurSuggestions(query) : undefined;
  });

  protected readonly suggestions = computed(() => this.suggestionsResource.value() ?? []);

  private lastHandledDeepLink = '';

  constructor() {
    effect(() => {
      const linked = this.search()?.trim() ?? '';
      if (
        linked &&
        this.searchForm.query().valid() &&
        linked !== this.currentPackageName() &&
        linked !== this.lastHandledDeepLink
      ) {
        if (this.searchModel().query !== linked) this.searchModel.update((model) => ({ ...model, query: linked }));
        this.selectPackage(linked);
        this.lastHandledDeepLink = linked;
      }
    });

    effect(() => {
      const query = this.searchModel().query.trim();
      if (!query) {
        this.clearSearch();
      }
    });
  }

  ngOnInit(): void {
    this.appService.updateSeoTags(this.meta, {
      title: 'AUR package scan',
      description: 'Scan AUR packages for malicious PKGBUILD content, suspicious URLs and risky maintainership changes',
      keywords: 'Chaotic-AUR, AUR, security, PKGBUILD, VirusTotal, scan',
      url: this.router.url,
    });
  }

  protected onFocus(): void {
    this.suggestionsVisible.set(true);
  }

  protected onBlur(): void {
    setTimeout(() => this.suggestionsVisible.set(false), 150);
    if (!this.searchForm.query().valid()) return;
    const query = this.searchModel().query.trim();
    if (query) this.selectPackage(query);
  }

  protected selectSuggestion(name: string): void {
    this.searchModel.update((model) => ({ ...model, query: name }));
    this.currentPackageName.set(name);
    this.suggestionsVisible.set(false);
    this.syncSearchParam(name);
  }

  private selectPackage(name: string): void {
    if (!name || this.currentPackageName() === name) return;
    this.currentPackageName.set(name);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: name },
      queryParamsHandling: 'merge',
      replaceUrl: true,
      info: { disableViewTransition: true },
    });
  }

  private syncSearchParam(name: string): void {
    if (!name) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: name },
      queryParamsHandling: 'merge',
      replaceUrl: true,
      info: { disableViewTransition: true },
    });
  }

  private clearSearch(): void {
    if (this.currentPackageName() !== '') this.currentPackageName.set('');
    if (this.route.snapshot.queryParamMap.has('search')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { search: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
        info: { disableViewTransition: true },
      });
    }
  }
}

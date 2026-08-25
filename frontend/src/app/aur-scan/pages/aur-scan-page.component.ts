import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounce, form, pattern } from '@angular/forms/signals';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { AutoComplete, AutoCompleteCompleteEvent } from '@openng/optimus-ui/autocomplete';
import { Card } from '@openng/optimus-ui/card';
import { firstValueFrom } from 'rxjs';
import { PKGNAME_PATTERN } from '@chaotic-next/shared-lib';
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
export class AurScanPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly appService = inject(AppService);
  private readonly meta = inject(Meta);
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

  protected selectSuggestion(name: string): void {
    this.searchModel.update((model) => ({ ...model, query: name }));
    this.currentPackageName.set(name);
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

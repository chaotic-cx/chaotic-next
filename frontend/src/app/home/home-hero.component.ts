import { NgOptimizedImage } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounce, form, pattern } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { type Package, type Paginated, PKGNAME_PATTERN } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AutoComplete } from '@openng/optimus-ui/autocomplete';
import { AppService, pkgnamesInRepo } from '../app.service';
import { createSuggestions } from '../autocomplete-suggestions';
import { lightLogo } from '../logo';

const MIN_SUGGESTION_QUERY_LENGTH = 3;
const SUGGESTION_REPO = 'chaotic-aur';

/**
 * Most downloaded over 30 days (metrics/rank, October 2026), without Garuda system packages.
 * Static so the prerendered hero shows them at once. Refresh the list from the metrics API now and then.
 */
const POPULAR_PACKAGES: readonly string[] = ['brave-bin', 'google-chrome', 'visual-studio-code-bin', 'dxvk-mingw-git'];

/**
 * The home hero: logo, headline, package search with popular picks, and the setup strip.
 */
@Component({
  selector: 'chaotic-home-hero',
  imports: [AutoComplete, FormsModule, NgOptimizedImage, RouterLink, TranslocoDirective],
  templateUrl: './home-hero.component.html',
  styleUrl: './home-hero.component.css',
})
export class HomeHeroComponent {
  private readonly appService = inject(AppService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly lightLogo = lightLogo;
  protected readonly popularPackages = POPULAR_PACKAGES;

  protected readonly searchModel = signal({ query: '' });
  protected readonly searchForm = form(this.searchModel, (schemaPath) => {
    debounce(schemaPath.query, 300);
    pattern(schemaPath.query, PKGNAME_PATTERN, { message: this.transloco.translate('home.search.invalidName') });
  });

  protected readonly suggestions = createSuggestions({
    minLength: MIN_SUGGESTION_QUERY_LENGTH,
    request: (query) => this.appService.getPkgnameSuggestionsRequest(query),
    toNames: (page: Paginated<Package>) => pkgnamesInRepo(page, SUGGESTION_REPO),
  });

  searchPackages(query: string): void {
    void this.router.navigate(['/stats/search'], {
      queryParams: { search: query || null },
    });
  }

  onSearchEnter(): void {
    if (!this.searchForm.query().valid()) return;

    this.searchPackages(this.searchModel().query);
  }

  onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearchEnter();
    }
  }
}

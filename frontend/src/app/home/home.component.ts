import { BreakpointObserver } from '@angular/cdk/layout';
import { NgOptimizedImage } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { debounce, FormField, form, pattern } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Package, Paginated } from '@chaotic-next/shared-lib';
import { AnimateOnScrollModule } from '@openng/optimus-ui/animateonscroll';
import { Button } from '@openng/optimus-ui/button';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { map } from 'rxjs';
import { AppService } from '../app.service';
import { BuildStatusService } from '../build-status/build-status.service';
import { PACKAGE_NAME_PATTERN, parseFocusQuery, resourceValue } from '../functions';
import { MirrorMapComponent } from '../mirror-map/mirror-map.component';
import { MirrorsService } from '../mirrors/mirrors.service';
import { NewsfeedComponent } from '../newsfeed/newsfeed.component';
import { RecentlyAddedComponent } from '../recently-added/recently-added.component';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { SearchSuggestionsComponent } from '../search-suggestions/search-suggestions.component';

@Component({
  selector: 'chaotic-home',
  imports: [
    AnimateOnScrollModule,
    NewsfeedComponent,
    RecentlyAddedComponent,
    MirrorMapComponent,
    RouterLink,
    NgOptimizedImage,
    Button,
    Tooltip,
    InputText,
    FormField,
    SearchSuggestionsComponent,
    RelativeTimePipe,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  observer = inject(BreakpointObserver);

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly buildStatusService = inject(BuildStatusService);
  protected readonly mirrorsService = inject(MirrorsService);

  protected readonly focus = toSignal(this.route.queryParamMap.pipe(map(parseFocusQuery)), {
    initialValue: null as [number, number] | null,
  });

  readonly isWide = signal<boolean>(true);

  protected readonly searchModel = signal({ query: '' });
  protected readonly searchForm = form(this.searchModel, (schemaPath) => {
    debounce(schemaPath.query, 300);
    pattern(schemaPath.query, PACKAGE_NAME_PATTERN, { message: 'Invalid package name' });
  });

  protected readonly suggestionsVisible = signal(false);

  private readonly suggestionsResource = httpResource<Paginated<Package>>(() => {
    const query = this.searchModel().query.trim();
    return query.length >= 3
      ? this.appService.getPackagesResourceRequest({ page: 1, perPage: 200, q: query })
      : undefined;
  });

  protected readonly suggestions = computed<string[]>(() => [
    ...new Set(
      (resourceValue(this.suggestionsResource)?.items ?? [])
        .filter((pkg) => pkg.reponame === 'chaotic-aur')
        .map((pkg) => pkg.pkgname),
    ),
  ]);

  constructor() {
    this.observer
      .observe('(min-width: 768px)')
      .pipe(takeUntilDestroyed())
      .subscribe((result) => {
        this.isWide.set(result.matches);
        this.cdr.markForCheck();
      });
  }

  searchPackages(query: string): void {
    this.suggestionsVisible.set(false);
    void this.router.navigate(['/stats/search'], {
      queryParams: { search: query || null },
      info: { disableViewTransition: true },
    });
  }

  onSearchEnter(): void {
    if (!this.searchForm.query().valid()) return;
    this.searchPackages(this.searchModel().query);
  }

  hideSuggestions(): void {
    setTimeout(() => this.suggestionsVisible.set(false), 150);
  }

  scrollToNews(newsTarget: HTMLElement): void {
    if (newsTarget) {
      const rect = newsTarget.getBoundingClientRect();
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      window.scrollTo({
        top: rect.top + scrollTop - 80,
        behavior: 'smooth',
      });
    }
  }
}

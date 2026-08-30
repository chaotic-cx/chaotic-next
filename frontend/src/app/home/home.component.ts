import { BreakpointObserver } from '@angular/cdk/layout';
import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounce, form, pattern } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PKGNAME_PATTERN } from '@chaotic-next/shared-lib';
import { AnimateOnScrollModule } from '@openng/optimus-ui/animateonscroll';
import { AutoComplete, AutoCompleteCompleteEvent } from '@openng/optimus-ui/autocomplete';
import { Button } from '@openng/optimus-ui/button';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { map } from 'rxjs';
import { AppService } from '../app.service';
import { BuildStatusService } from '../build-status/build-status.service';
import { parseFocusQuery } from '../functions';
import { MirrorMapComponent } from '../mirror-map/mirror-map.component';
import { MirrorsService } from '../mirrors/mirrors.service';
import { NewsfeedComponent } from '../newsfeed/newsfeed.component';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { RecentlyAddedComponent } from '../recently-added/recently-added.component';

@Component({
  selector: 'chaotic-home',
  imports: [
    AnimateOnScrollModule,
    AutoComplete,
    FormsModule,
    NewsfeedComponent,
    RecentlyAddedComponent,
    MirrorMapComponent,
    RouterLink,
    NgOptimizedImage,
    Button,
    Tooltip,
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
    pattern(schemaPath.query, PKGNAME_PATTERN, { message: 'Invalid package name' });
  });

  protected readonly suggestions = signal<string[]>([]);
  private suggestionGeneration = 0;

  constructor() {
    this.observer
      .observe('(min-width: 768px)')
      .pipe(takeUntilDestroyed())
      .subscribe((result) => {
        this.isWide.set(result.matches);
        this.cdr.markForCheck();
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
      const names = await this.appService.fetchPkgnameSuggestions(query, 'chaotic-aur');
      if (generation !== this.suggestionGeneration) return;
      this.suggestions.set(names);
    } catch {
      if (generation === this.suggestionGeneration) this.suggestions.set([]);
    }
  }

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
    if (event.key === 'Enter') this.onSearchEnter();
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

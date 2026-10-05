import { NgOptimizedImage } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounce, form, pattern } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { type Package, type Paginated, PKGNAME_PATTERN } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AutoComplete } from '@openng/optimus-ui/autocomplete';
import { map } from 'rxjs';
import { AppService, pkgnamesInRepo } from '../app.service';
import { createSuggestions } from '../autocomplete-suggestions';
import { MATRIX_ROOM_URL } from '../community-links';
import { parseFocusQuery } from '../functions';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { lightLogo } from '../logo';
import { MirrorMapComponent } from '../mirror-map/mirror-map.component';
import { MirrorsService } from '../mirrors/mirrors.service';
import { NewsfeedComponent } from '../newsfeed/newsfeed.component';
import { RecentlyAddedComponent } from '../recently-added/recently-added.component';
import { PipelineStripComponent } from './pipeline-strip.component';

const MIN_SUGGESTION_QUERY_LENGTH = 3;
const SUGGESTION_REPO = 'chaotic-aur';

@Component({
  selector: 'chaotic-home',
  imports: [
    AutoComplete,
    FormsModule,
    NewsfeedComponent,
    RecentlyAddedComponent,
    MirrorMapComponent,
    PipelineStripComponent,
    LoadErrorComponent,
    RouterLink,
    NgOptimizedImage,
    TranslocoDirective,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  private readonly appService = inject(AppService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly mirrorsService = inject(MirrorsService);
  protected readonly lightLogo = lightLogo;

  protected readonly matrixRoomUrl = MATRIX_ROOM_URL;

  protected readonly focus = toSignal(this.route.queryParamMap.pipe(map(parseFocusQuery)), {
    initialValue: null as [number, number] | null,
  });

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
    if (event.key === 'Enter') this.onSearchEnter();
  }
}

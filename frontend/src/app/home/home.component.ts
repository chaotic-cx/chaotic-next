import { BreakpointObserver } from '@angular/cdk/layout';
import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AnimateOnScrollModule } from '@openng/optimus-ui/animateonscroll';
import { Button } from '@openng/optimus-ui/button';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { MirrorMapComponent } from '../mirror-map/mirror-map.component';
import { NewsfeedComponent } from '../newsfeed/newsfeed.component';

@Component({
  selector: 'chaotic-home',
  imports: [
    AnimateOnScrollModule,
    NewsfeedComponent,
    MirrorMapComponent,
    RouterLink,
    NgOptimizedImage,
    Button,
    Tooltip,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  observer = inject(BreakpointObserver);

  private readonly cdr = inject(ChangeDetectorRef);

  readonly isWide = signal<boolean>(true);

  constructor() {
    this.observer
      .observe('(min-width: 768px)')
      .pipe(takeUntilDestroyed())
      .subscribe((result) => {
        this.isWide.set(result.matches);
        this.cdr.markForCheck();
      });
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

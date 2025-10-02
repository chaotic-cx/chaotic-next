import { BreakpointObserver } from '@angular/cdk/layout';
import { NgClass, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnimateOnScrollModule } from 'primeng/animateonscroll';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Ripple } from 'primeng/ripple';
import { MirrorMapComponent } from '../mirror-map/mirror-map.component';
import { NewsfeedComponent } from '../newsfeed/newsfeed.component';

@Component({
  selector: 'chaotic-home',
  imports: [
    AnimateOnScrollModule,
    NewsfeedComponent,
    ButtonDirective,
    Ripple,
    ButtonLabel,
    MirrorMapComponent,
    RouterLink,
    NgOptimizedImage,
    NgClass,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  isWide = signal<boolean>(true);
  observer = inject(BreakpointObserver);

  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit() {
    this.observer.observe('(min-width: 768px)').subscribe((result) => {
      this.isWide.set(result.matches);
      this.cdr.markForCheck();
    });
  }

  /**
   * Many thanks for adapting the original applet and letting us use it!
   * Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)
   * Copyright (c) 2018 Juan Carlos Ponce Campuzano
   */
  openApplet() {
    window.location.href = 'https://aur.chaotic.cx/aizawa/index.html';
  }
}

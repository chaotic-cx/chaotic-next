import { Component, inject, OnInit, signal } from '@angular/core';
import { NewsfeedComponent } from '../newsfeed/newsfeed.component';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Ripple } from 'primeng/ripple';
import { MirrorMapComponent } from '../mirror-map/mirror-map.component';
import { RouterLink } from '@angular/router';
import { AnimateOnScrollModule } from 'primeng/animateonscroll';
import { NgOptimizedImage } from '@angular/common';
import { BreakpointObserver } from '@angular/cdk/layout';

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
    ButtonIcon,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit {
  isWide = signal<boolean>(true);
  observer = inject(BreakpointObserver);

  ngOnInit() {
    this.observer.observe('(min-width: 768px)').subscribe((result) => {
      this.isWide.set(result.matches);
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

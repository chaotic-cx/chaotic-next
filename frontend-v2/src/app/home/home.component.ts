import { Component } from '@angular/core';
import { NewsfeedComponent } from '../newsfeed/newsfeed.component';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Ripple } from 'primeng/ripple';
import { MirrorMapComponent } from '../mirror-map/mirror-map.component';
import { RouterLink } from '@angular/router';
import { AnimateOnScrollModule } from 'primeng/animateonscroll';
import { NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'chaotic-home',
  imports: [
    AnimateOnScrollModule,
    NewsfeedComponent,
    ButtonDirective,
    Ripple,
    ButtonLabel,
    ButtonIcon,
    MirrorMapComponent,
    RouterLink,
    NgOptimizedImage,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  constructor() {}
}

import { Component } from '@angular/core';
import { NewsfeedComponent } from '../newsfeed/newsfeed.component';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Ripple } from 'primeng/ripple';
import { MirrorMapComponent } from '../mirror-map/mirror-map.component';
import { RouterLink } from '@angular/router';
import { AnimateOnScrollModule } from 'primeng/animateonscroll';

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
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  constructor() {}
}

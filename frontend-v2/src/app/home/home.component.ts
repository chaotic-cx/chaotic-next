import { Component } from '@angular/core';
import { NewsfeedComponent } from '../newsfeed/newsfeed.component';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Ripple } from 'primeng/ripple';
import { ChaoticAttractorComponent } from '../chaotic-attractor/chaotic-attractor.component';
import { MirrorMapComponent } from '../mirror-map/mirror-map.component';

@Component({
  selector: 'chaotic-home',
  imports: [
    NewsfeedComponent,
    ButtonDirective,
    Ripple,
    ChaoticAttractorComponent,
    ButtonLabel,
    ButtonIcon,
    MirrorMapComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  constructor() {}
}

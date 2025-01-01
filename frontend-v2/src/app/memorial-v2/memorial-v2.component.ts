import { Component } from '@angular/core';
import { Image } from 'primeng/image';
import { Card } from 'primeng/card';
import { AnimateOnScroll } from 'primeng/animateonscroll';
import { TitleComponent } from '../title/title.component';

@Component({
  selector: 'chaotic-memorial-v2',
  imports: [Image, Card, AnimateOnScroll, TitleComponent],
  templateUrl: './memorial-v2.component.html',
  styleUrl: './memorial-v2.component.css',
})
export class MemorialV2Component {
  desktops: string[] = [
    'AnkurAlpha.png',
    'FameWolf.jpg',
    'anispwyn.png',
    'dr460nf1r3.png',
    'elite.jpg',
    'icar.jpg',
    'victorsouzaleal.png',
    'yada.png',
    'zoeruda.jpg',
  ];
  terms: string[] = ['darian.png', 'dr460nf1r3.png', 'elite.jpg', 'immortalis.png', 'juest.jpg', 'yada.png'];
  desktopLinks: string[] = [];
  termLinks: string[] = [];

  subtitle =
    'Three years passed since the the third birthday of Chaotic-AUR and celebrating it with a memorial of screenshots.<br>' +
    'This time, we are celebrating the sixth birthday of Chaotic-AUR with another round of community contributions ' +
    'and the release of our <a class="text-maroon" href="https://gitlab.com/chaotic-aur/pkgbuilds"> new build system infra 4.0 🎉</a>';

  constructor() {
    for (const filename of this.desktops) {
      const baseUrl = 'https://raw.githubusercontent.com/chaotic-cx/memorial-v2/main/desktops/';
      this.desktopLinks.push(baseUrl + filename);
    }
    for (const filename of this.terms) {
      const baseUrl = 'https://raw.githubusercontent.com/chaotic-cx/memorial-v2/main/terminals/';
      this.termLinks.push(baseUrl + filename);
    }
  }
}

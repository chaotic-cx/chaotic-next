import { Component, inject, OnInit } from '@angular/core';
import { Image } from 'primeng/image';
import { Card } from 'primeng/card';
import { TitleComponent } from '../title/title.component';
import { Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { updateSeoTags } from '../functions';

@Component({
  selector: 'chaotic-memorial-v2',
  imports: [Image, Card, TitleComponent],
  templateUrl: './memorial-v2.component.html',
  styleUrl: './memorial-v2.component.css',
})
export class MemorialV2Component implements OnInit {
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);

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

  desktopLinks: { full: string; preview: string }[] = [];
  termLinks: { full: string; preview: string }[] = [];

  subtitle =
    'Three years passed since the the third birthday of Chaotic-AUR and celebrating it with a memorial of screenshots.<br>' +
    'This time, we are celebrating the sixth birthday of Chaotic-AUR with another round of community contributions ' +
    'and the release of our <a class="text-maroon" href="https://gitlab.com/chaotic-aur/pkgbuilds"> new build system infra 4.0 🎉</a>';

  constructor() {
    for (const filename of this.desktops) {
      const baseUrl = 'https://raw.githubusercontent.com/chaotic-cx/memorial-v2/main/desktops/';
      this.desktopLinks.push({ full: baseUrl + filename, preview: `/memorials/2024/desktops/${filename}.webp` });
    }
    for (const filename of this.terms) {
      const baseUrl = 'https://raw.githubusercontent.com/chaotic-cx/memorial-v2/main/terminals/';
      this.termLinks.push({ full: baseUrl + filename, preview: `/memorials/2024/terminals/${filename}.webp` });
    }
  }

  ngOnInit() {
    updateSeoTags(
      this.meta,
      'Memorial 2024',
      'Memorial of Chaotic-AUR 2024, celebrating the sixth birthday of Chaotic-AUR',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR memorial',
      this.router.url,
    );
  }
}

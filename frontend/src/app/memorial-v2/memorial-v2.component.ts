import { Component, inject, OnInit } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Card } from '@openng/optimus-ui/card';
import { Image } from '@openng/optimus-ui/image';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { updateSeoTags } from '../functions';
import { TitleComponent } from '../title/title.component';

@Component({
  selector: 'chaotic-memorial-v2',
  imports: [Card, Image, TitleComponent, ProgressSpinner, RouterLink],
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

  desktopLinks: { author: string; full: string; preview: string }[] = [];
  termLinks: { author: string; full: string; preview: string }[] = [];

  subtitle =
    'Celebrating the sixth birthday of Chaotic-AUR with community screenshot contributions ' +
    'and the launch of our <a class="text-ctp-peach hover:underline" href="https://gitlab.com/chaotic-aur/pkgbuilds" target="_blank" rel="noopener noreferrer">new build system infra 4.0 🎉</a>';

  constructor() {
    for (const filename of this.desktops) {
      const author = filename.replace(/\.(png|jpg|jpeg|webp)$/i, '');
      this.desktopLinks.push({
        author,
        full: `/memorials/2024/desktops/${filename}.webp`,
        preview: `/memorials/2024/desktops/${filename}.webp`,
      });
    }
    for (const filename of this.terms) {
      const author = filename.replace(/\.(png|jpg|jpeg|webp)$/i, '');
      this.termLinks.push({
        author,
        full: `/memorials/2024/terminals/${filename}.webp`,
        preview: `/memorials/2024/terminals/${filename}.webp`,
      });
    }
  }

  ngOnInit() {
    updateSeoTags(this.meta, {
      title: 'Chaotic-AUR - Memorial 2024',
      description: 'Memorial of Chaotic-AUR 2024, celebrating the sixth birthday of Chaotic-AUR',
      keywords:
        'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR memorial',
      url: this.router.url,
    });
  }
}

import type { TeamList } from '@./shared-lib';
import { NgOptimizedImage } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Ripple } from 'primeng/ripple';
import { Panel } from 'primeng/panel';
import { Card } from 'primeng/card';
import { Accordion, AccordionContent, AccordionHeader, AccordionPanel } from 'primeng/accordion';
import { BreakpointObserver } from '@angular/cdk/layout';
import { TitleComponent } from '../title/title.component';
import { Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { updateSeoTags } from '../functions';

@Component({
  selector: 'chaotic-about',
  imports: [
    NgOptimizedImage,
    Ripple,
    Panel,
    Card,
    Accordion,
    AccordionPanel,
    AccordionHeader,
    AccordionContent,
    TitleComponent,
  ],
  templateUrl: './about.component.html',
  styleUrl: './about.component.css',
})
export class AboutComponent implements OnInit {
  protected isWide: boolean = true;
  private readonly meta = inject(Meta);
  private readonly observer = inject(BreakpointObserver);
  private readonly router = inject(Router);

  team: TeamList = [
    {
      name: 'Nico Jensch',
      github: 'dr460nf1r3',
      role: 'Lead Maintainer',
    },
    {
      name: 'TNE',
      github: 'JustTNE',
      role: 'Infra maintainer',
    },
    {
      name: 'Pedro H. Lara Campos',
      github: 'PedroHLC',
      role: 'Founder',
    },
    {
      name: 'Paulo Matias',
      github: 'thotypous',
      role: 'Former TU, Co-founder',
    },
    {
      name: 'Technetium1',
      github: 'technetium1',
      role: 'Package maintenance',
    },
    {
      name: 'xiota',
      github: 'xiota',
      role: 'Package maintenance',
    },
    {
      name: 'SolarAquarion',
      github: 'SolarAquarion',
      role: 'Package maintenance',
    },
    {
      name: 'LordKitsuna',
      github: 'lordkitsuna',
      role: 'Former kernel builder',
    },
    {
      name: 'João Figueiredo',
      github: 'IslandC0der',
      role: 'KDE git packages',
    },
    {
      name: 'Alexjp',
      github: 'alexjp',
      role: 'KDE git packages',
    },
    {
      name: 'Rustem B.',
      github: 'RustemB',
      role: 'Package maintenance',
    },
  ];

  constructor() {
    // Construct avatar URLs
    for (const member of this.team) {
      member.avatarUrl = `/assets/avatars/${member.github}.webp`;
    }
  }

  ngOnInit() {
    updateSeoTags(
      this.meta,
      'About us',
      'Learn more about the Chaotic-AUR team and project',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR about',
      this.router.url,
    );

    this.observer.observe(['(min-width: 768px)']).subscribe((result) => {
      this.isWide = result.matches;
    });
  }
}

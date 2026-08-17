import { BreakpointObserver } from '@angular/cdk/layout';
import { NgOptimizedImage } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import type { TeamList } from '@chaotic-next/shared-lib';
import { Accordion, AccordionContent, AccordionHeader, AccordionPanel } from '@openng/optimus-ui/accordion';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Card } from '@openng/optimus-ui/card';
import { Panel } from '@openng/optimus-ui/panel';
import { Ripple } from '@openng/optimus-ui/ripple';
import { updateSeoTags } from '../functions';
import { TitleComponent } from '../title/title.component';

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
    PrimeTemplate,
  ],
  templateUrl: './about.component.html',
  styleUrl: './about.component.css',
})
export class AboutComponent implements OnInit {
  private readonly meta = inject(Meta);
  private readonly observer = inject(BreakpointObserver);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isWide = signal<boolean>(true);

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
      name: 'Yumi',
      github: 'a0xz',
      role: 'Mirror management',
    },
    {
      name: 'Joëlle van Essen',
      github: 'JoelleJS',
      role: 'Package reviews',
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
    for (const member of this.team) {
      member.avatarUrl = `/assets/avatars/${member.github}.webp`;
    }

    this.observer
      .observe(['(min-width: 768px)'])
      .pipe(takeUntilDestroyed())
      .subscribe((result) => {
        this.isWide.set(result.matches);
      });
  }

  ngOnInit() {
    updateSeoTags(this.meta, {
      title: 'About us',
      description: 'Learn more about the Chaotic-AUR team and project',
      keywords:
        'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR about',
      url: this.router.url,
    });

    this.route.fragment
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fragment) => this.scrollToFragment(fragment));
  }

  scrollTo(id: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      fragment: id,
      info: { disableViewTransition: true },
    });
  }

  private scrollToFragment(fragment: string | null): void {
    if (!fragment) return;
    document.getElementById(fragment)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

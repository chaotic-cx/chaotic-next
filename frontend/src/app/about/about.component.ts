import { NgOptimizedImage } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TeamList } from '@chaotic-next/shared-lib';
import { setPageSeo } from '../functions';
import { TitleComponent } from '../title/title.component';

interface UsefulLink {
  label: string;
  text: string;
  href: string;
}

const USEFUL_LINKS: UsefulLink[] = [
  { label: 'News channel', text: 't.me/s/chaotic_aur', href: 'https://t.me/s/chaotic_aur' },
  { label: 'Community chat', text: 't.me/chaotic_aur_sac', href: 'https://t.me/s/chaotic_aur_sac' },
  {
    label: 'Matrix bridge',
    text: '#chaotic-aur:mozilla.org',
    href: 'https://matrix.to/#/%23chaotic-aur:mozilla.org',
  },
  { label: 'Package list', text: 'pkgs.org', href: 'https://archlinux.pkgs.org/rolling/chaotic-aur-x86_64/' },
  {
    label: 'Manual downloads',
    text: 'builds.garudalinux.org',
    href: 'https://builds.garudalinux.org/repos/chaotic-aur/x86_64/',
  },
  { label: 'Infra toolbox', text: 'github.com/chaotic-aur/toolbox', href: 'https://github.com/chaotic-aur/toolbox' },
  { label: 'Status page', text: 'uptimes.chaotic.cx', href: 'https://uptimes.chaotic.cx' },
  { label: 'Build logs', text: 'logfiles', href: 'https://builds.garudalinux.org/repos/chaotic-aur/logs/' },
  { label: 'Signing keys', text: 'chaotic.gpg', href: 'https://aur.chaotic.cx/chaotic.gpg' },
];

interface Thanks {
  name: string;
  note?: string;
  href?: string;
}

const SPECIAL_THANKS: Thanks[] = [
  { name: 'Librewish (Shrinivas Kumbhar)', note: 'former co-maintainer, Garuda Linux founder' },
  { name: 'Garuda Linux staffers' },
  { name: 'All current and past mirror providers' },
  { name: 'Tk-Glitch (TkG)', href: 'https://github.com/Tk-Glitch' },
  { name: 'Kodehawa', href: 'https://github.com/Kodehawa' },
  { name: 'Figue', href: 'https://aur.archlinux.org/account/figue' },
  { name: 'Benjamim Gois', href: 'https://github.com/benjamimgois' },
  {
    name: 'Dr Juan Carlos Ponce Campuzano',
    note: 'creator of the Aizawa applet and our logo',
    href: 'https://www.patreon.com/jcponce',
  },
  { name: 'BlackStarMuzic', note: 'clean version of our logo' },
  { name: 'Frogging Family and Linux Gaming Dev Discord servers' },
  { name: 'André, Gabriel Olivato and Maiser', href: 'https://github.com/olivatooo' },
  { name: 'AUR package maintainers, Arch Linux TUs and staffers' },
  { name: 'Everybody who helped with the projects we pre-build' },
];

@Component({
  selector: 'chaotic-about',
  imports: [NgOptimizedImage, TitleComponent, RouterLink],
  templateUrl: './about.component.html',
  styleUrl: './about.component.css',
})
export class AboutComponent {
  readonly usefulLinks = USEFUL_LINKS;
  readonly specialThanks = SPECIAL_THANKS;

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

    setPageSeo(
      'About us · Chaotic-AUR',
      'Learn more about the Chaotic-AUR team and project',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR about',
    );
  }
}

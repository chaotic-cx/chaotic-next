import { NgOptimizedImage } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { MATRIX_ROOM_ALIAS, MATRIX_ROOM_URL } from '../community-links';
import { setPageSeo } from '../functions';
import { TitleComponent } from '../title/title.component';

interface UsefulLink {
  labelKey: string;
  text?: string;
  textKey?: string;
  href: string;
}

const USEFUL_LINKS: UsefulLink[] = [
  { labelKey: marker('about.usefulLinks.newsChannel'), text: 't.me/s/chaotic_aur', href: 'https://t.me/s/chaotic_aur' },
  {
    labelKey: marker('about.usefulLinks.communityChat'),
    text: 't.me/chaotic_aur_sac',
    href: 'https://t.me/s/chaotic_aur_sac',
  },
  {
    labelKey: marker('about.usefulLinks.matrixBridge'),
    text: MATRIX_ROOM_ALIAS,
    href: MATRIX_ROOM_URL,
  },
  {
    labelKey: marker('about.usefulLinks.packageList'),
    text: 'pkgs.org',
    href: 'https://archlinux.pkgs.org/rolling/chaotic-aur-x86_64/',
  },
  {
    labelKey: marker('about.usefulLinks.manualDownloads'),
    text: 'builds.garudalinux.org',
    href: 'https://builds.garudalinux.org/repos/chaotic-aur/x86_64/',
  },
  {
    labelKey: marker('about.usefulLinks.chaoticManager'),
    text: 'chaotic-manager.pages.dev',
    href: 'https://chaotic-manager.pages.dev/',
  },
  { labelKey: marker('about.usefulLinks.statusPage'), text: 'uptime.chaotic.cx', href: 'https://uptime.chaotic.cx' },
];

// Proper names stay in `name`; descriptive entries use `nameKey` for translation.
interface Thanks {
  name?: string;
  nameKey?: string;
  noteKey?: string;
  href?: string;
}

const SPECIAL_THANKS: Thanks[] = [
  { name: 'Librewish (Shrinivas Kumbhar)', noteKey: marker('about.specialThanks.librewishNote') },
  { nameKey: marker('about.specialThanks.garudaStaffers') },
  { nameKey: marker('about.specialThanks.mirrorProviders') },
  { name: 'Tk-Glitch (TkG)', href: 'https://github.com/Tk-Glitch' },
  { name: 'Kodehawa' },
  { name: 'Figue', href: 'https://aur.archlinux.org/packages/?maintainer=figue' },
  { name: 'Benjamim Gois', href: 'https://github.com/benjamimgois' },
  {
    name: 'Dr Juan Carlos Ponce Campuzano',
    noteKey: marker('about.specialThanks.aizawaNote'),
    href: 'https://www.patreon.com/jcponce',
  },
  { name: 'BlackStarMuzic', noteKey: marker('about.specialThanks.cleanLogoNote') },
  { nameKey: marker('about.specialThanks.discordServers') },
  { name: 'André, Gabriel Olivato and Maiser', href: 'https://github.com/olivatooo' },
  { nameKey: marker('about.specialThanks.aurMaintainers') },
  { nameKey: marker('about.specialThanks.projectHelpers') },
];

interface TeamMember {
  name: string;
  github: string;
  roleKey: string;
}

const TEAM: TeamMember[] = [
  { name: 'Nico Jensch', github: 'dr460nf1r3', roleKey: marker('about.team.roles.leadMaintainer') },
  { name: 'TNE', github: 'JustTNE', roleKey: marker('about.team.roles.infraMaintainer') },
  { name: 'Pedro H. Lara Campos', github: 'PedroHLC', roleKey: marker('about.team.roles.founder') },
  { name: 'Paulo Matias', github: 'thotypous', roleKey: marker('about.team.roles.formerTuCoFounder') },
  { name: 'Technetium1', github: 'technetium1', roleKey: marker('about.team.roles.packageMaintenance') },
  { name: 'xiota', github: 'xiota', roleKey: marker('about.team.roles.packageMaintenance') },
  { name: 'Yumi', github: 'a0xz', roleKey: marker('about.team.roles.mirrorManagement') },
  { name: 'Joëlle van Essen', github: 'JoelleJS', roleKey: marker('about.team.roles.packageReviews') },
  { name: 'SolarAquarion', github: 'SolarAquarion', roleKey: marker('about.team.roles.packageMaintenance') },
  { name: 'LordKitsuna', github: 'lordkitsuna', roleKey: marker('about.team.roles.formerKernelBuilder') },
  { name: 'João Figueiredo', github: 'IslandC0der', roleKey: marker('about.team.roles.kdeGitPackages') },
  { name: 'Alexjp', github: 'alexjp', roleKey: marker('about.team.roles.kdeGitPackages') },
  { name: 'Rustem B.', github: 'RustemB', roleKey: marker('about.team.roles.packageMaintenance') },
];

@Component({
  selector: 'chaotic-about',
  imports: [NgOptimizedImage, TitleComponent, RouterLink, TranslocoDirective],
  templateUrl: './about.component.html',
  styleUrl: './about.component.css',
})
export class AboutComponent {
  private readonly transloco = inject(TranslocoService);

  readonly usefulLinks = USEFUL_LINKS;
  readonly specialThanks = SPECIAL_THANKS;
  readonly team = TEAM;

  constructor() {
    setPageSeo(
      this.transloco.translate('routes.titleFormat', { page: this.transloco.translate('routes.about') }),
      this.transloco.translate('about.seo.description'),
      this.transloco.translate('about.seo.keywords'),
    );
  }
}

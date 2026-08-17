import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Divider } from '@openng/optimus-ui/divider';
import { Panel } from '@openng/optimus-ui/panel';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { Highlight } from 'ngx-highlightjs';
import { APP_CONFIG } from '../../environments/app-config.token';
import { EnvironmentModel } from '../../environments/environment.model';
import { updateSeoTags } from '../functions';
import { TitleComponent } from '../title/title.component';

@Component({
  selector: 'chaotic-docs',
  templateUrl: './docs.component.html',
  styleUrl: './docs.component.css',
  imports: [Panel, Divider, TitleComponent, RouterLink, Highlight, Tooltip, PrimeTemplate],
})
export class DocsComponent implements OnInit {
  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly appendRepo = '[chaotic-aur]\nInclude = /etc/pacman.d/chaotic-mirrorlist';
  readonly ignorePkg = 'IgnorePkg = ...';
  readonly installPackage = '$ sudo pacman -S firedragon';
  readonly installPackageParu = '$ paru -S chaotic-aur/firefox-nightly';
  readonly installPackageSpecific = '$ sudo pacman -S chaotic-aur/mesa-tkg-git';
  readonly installRepoPackages =
    "$ sudo pacman -U 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-keyring.pkg.tar.zst'\n" +
    "$ sudo pacman -U 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-mirrorlist.pkg.tar.zst'";
  readonly powerpillUsage = '$ sudo pacman -Sy && sudo powerpill -Su && paru -Su';
  readonly receiveKeys: string;
  readonly syncMirrors = '$ sudo pacman -Syu';
  readonly apiDocsUrl = `${this.appConfig.backendUrl}/api/docs`;

  constructor() {
    this.receiveKeys =
      `$ sudo pacman-key --recv-key ${this.appConfig.primaryKey} --keyserver keyserver.ubuntu.com\n` +
      `$ sudo pacman-key --lsign-key ${this.appConfig.primaryKey}`;
  }

  ngOnInit() {
    updateSeoTags(this.meta, {
      title: 'Documentation',
      description: 'Documentation for Chaotic-AUR, a repository of packages for Arch Linux',
      keywords:
        'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR documentation',
      url: this.router.url,
    });

    this.route.fragment
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fragment) => this.scrollToFragment(fragment));
  }

  private scrollToFragment(fragment: string | null): void {
    if (!fragment) return;
    document.getElementById(fragment)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  scrollTo(id: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      fragment: id,
      info: { disableViewTransition: true },
    });
  }

  copyText(text: string) {
    if (!navigator.clipboard) return;

    navigator.clipboard
      .writeText(text.replaceAll('$ ', ''))
      .then(() => {
        this.messageToastService.info('Copied', 'The text has been copied to your clipboard');
      })
      .catch((err) => {
        this.messageToastService.error('Copied', 'Failed copying to clipboard');
        console.error(err);
      });
  }
}

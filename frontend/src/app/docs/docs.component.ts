import { Component, inject, OnInit } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { Highlight } from 'ngx-highlightjs';
import { Divider } from 'primeng/divider';
import { Panel } from 'primeng/panel';
import { Tooltip } from 'primeng/tooltip';
import { APP_CONFIG } from '../../environments/app-config.token';
import { EnvironmentModel } from '../../environments/environment.model';
import { updateSeoTags } from '../functions';
import { TitleComponent } from '../title/title.component';

@Component({
  selector: 'chaotic-docs',
  templateUrl: './docs.component.html',
  styleUrl: './docs.component.css',
  imports: [Panel, Divider, TitleComponent, RouterLink, Highlight, Tooltip],
})
export class DocsComponent implements OnInit {
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

  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);

  constructor() {
    this.receiveKeys =
      `$ sudo pacman-key --recv-key ${this.appConfig.primaryKey} --keyserver keyserver.ubuntu.com\n` +
      `$ sudo pacman-key --lsign-key ${this.appConfig.primaryKey}`;
  }

  ngOnInit() {
    updateSeoTags(
      this.meta,
      'Documentation',
      'Documentation for Chaotic-AUR, a repository of packages for Arch Linux',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR documentation',
      this.router.url,
    );
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

import { isPlatformBrowser } from '@angular/common';
import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import hljs from 'highlight.js';
import { CopyButtonPlugin } from './hljs-copybutton';
import { HighlightJsDirective } from 'ngx-highlight-js';
import { Panel } from 'primeng/panel';
import { Divider } from 'primeng/divider';
import { APP_CONFIG } from '../../environments/app-config.token';
import { EnvironmentModel } from '../../environments/environment.model';
import { TitleComponent } from '../title/title.component';

@Component({
  selector: 'chaotic-docs',
  templateUrl: './docs.component.html',
  styleUrl: './docs.component.css',
  imports: [HighlightJsDirective, Panel, Divider, TitleComponent],
})
export class DocsComponent implements OnInit {
  isBrowser = true;
  installRepo: string;
  appendRepo = '[chaotic-aur]\nInclude = /etc/pacman.d/chaotic-mirrorlist';
  installPackage = '$ sudo pacman -S chaotic-aur/mesa-tkg-git';
  installPackageParu = '$ paru -S chaotic-aur/firefox-hg';
  powerpillUsage = '$ sudo pacman -Sy\n$ sudo powerpill -Su\n$ paru -Su';
  ignorePkg = 'IgnorePkg = ...';
  syncMirrors = '$ sudo pacman -Sy\n$ sudo pacman -Su ungoogled-chromium';

  appConfig: EnvironmentModel = inject(APP_CONFIG);
  platformId = inject(PLATFORM_ID);

  constructor() {
    // Prevent document is not defined errors during building / SSR
    this.isBrowser = isPlatformBrowser(this.platformId);
    this.installRepo =
      `$ sudo pacman-key --recv-key ${this.appConfig.primaryKey} --keyserver keyserver.ubuntu.com\n` +
      `$ sudo pacman-key --lsign-key ${this.appConfig.primaryKey}\n` +
      "$ sudo pacman -U 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-keyring.pkg.tar.zst'\n" +
      "$ sudo pacman -U 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-mirrorlist.pkg.tar.zst'\n";
  }

  ngOnInit() {
    if (this.isBrowser) {
      setTimeout(() => {
        hljs.addPlugin(new CopyButtonPlugin());
        hljs.highlightAll();
      }, 500);
    }
  }
}

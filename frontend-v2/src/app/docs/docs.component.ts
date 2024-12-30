import { CAUR_PRIMARY_KEY } from '@./shared-lib';
import { isPlatformBrowser } from '@angular/common';
import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import hljs from 'highlight.js';
import { CopyButtonPlugin } from './hljs-copybutton';
import { HighlightJsDirective } from 'ngx-highlight-js';
import { Panel } from 'primeng/panel';
import { Divider } from 'primeng/divider';
import { ScrollTop } from 'primeng/scrolltop';

@Component({
  selector: 'chaotic-docs',
  templateUrl: './docs.component.html',
  styleUrl: './docs.component.css',
  imports: [HighlightJsDirective, Panel, Divider],
})
export class DocsComponent implements OnInit {
  isBrowser = true;
  installRepo =
    `pacman-key --recv-key ${CAUR_PRIMARY_KEY} --keyserver keyserver.ubuntu.com\n` +
    `pacman-key --lsign-key ${CAUR_PRIMARY_KEY}\n` +
    "pacman -U 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-keyring.pkg.tar.zst'\n" +
    "pacman -U 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-mirrorlist.pkg.tar.zst'\n";
  appendRepo = '[chaotic-aur]\nInclude = /etc/pacman.d/chaotic-mirrorlist';
  installPackage = 'pacman -S chaotic-aur/mesa-tkg-git';
  installPackageParu = 'paru -S chaotic-aur/firefox-hg';
  powerpillUsage = 'sudo pacman -Sy\nsudo powerpill -Su\nparu -Su';
  ignorePkg = 'IgnorePkg = ...';

  platformId = inject(PLATFORM_ID);

  constructor() {
    // Prevent document is not defined errors during building / SSR
    this.isBrowser = isPlatformBrowser(this.platformId);
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

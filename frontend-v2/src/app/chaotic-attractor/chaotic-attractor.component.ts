import { CAUR_HOME_URL } from '@./shared-lib';
import { isPlatformBrowser } from '@angular/common';
import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { checkIfMobile } from '../functions';
import { Image } from 'primeng/image';
import { Ripple } from 'primeng/ripple';

@Component({
  selector: 'chaotic-attractor',
  templateUrl: './chaotic-attractor.component.html',
  styleUrl: './chaotic-attractor.component.css',
  imports: [Image, Ripple],
})
export class ChaoticAttractorComponent {
  // Many thanks for adapting the original applet and letting us use it!
  // Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)
  // Copyright (c) 2018 Juan Carlos Ponce Campuzano
  url = CAUR_HOME_URL + 'aizawa/index.html';
  urlSafe: SafeResourceUrl;
  displayInteractive = false;
  isMobile = false;

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    public sanitizer: DomSanitizer,
  ) {
    this.urlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(this.url);
    this.checkIfExists(platformId);
    this.isMobile = checkIfMobile();
  }

  /**
   * Open the applet in a new tab.
   */
  openApplet(): void {
    window.location.href = this.url;
  }

  /**
   * Check if the platform is a browser and then checks if the iframe URL exists.
   * @param platformId The platform ID.
   * @private
   */
  private checkIfExists(platformId: object): void {
    if (isPlatformBrowser(platformId)) {
      const request = new XMLHttpRequest();
      request.open('GET', this.urlSafe.toString(), false);
      request.send();
      if (request.status !== 200) {
        this.displayInteractive = false;
      }
    }
  }
}
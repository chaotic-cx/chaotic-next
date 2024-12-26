import { CAUR_MAP_URL } from '@./shared-lib';
import { Component, type ElementRef, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'chaotic-mirror-map',
  imports: [],
  templateUrl: './mirror-map.component.html',
  styleUrl: './mirror-map.component.css',
})
export class MirrorMapComponent {
  url: string = CAUR_MAP_URL;
  urlSafe: SafeResourceUrl;
  // @ts-ignore
  @ViewChild('iframe', { static: false }) iframe: ElementRef;

  constructor(public sanitizer: DomSanitizer) {
    this.urlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(this.url);
  }
}

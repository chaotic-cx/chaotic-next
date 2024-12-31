import { Component, type ElementRef, inject, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { APP_CONFIG } from '../../environments/app-config.token';
import { EnvironmentModel } from '../../environments/environment.model';

@Component({
  selector: 'chaotic-mirror-map',
  imports: [],
  templateUrl: './mirror-map.component.html',
  styleUrl: './mirror-map.component.css',
})
export class MirrorMapComponent {
  urlSafe: SafeResourceUrl;

  @ViewChild('iframe', { static: false }) iframe!: ElementRef;

  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly sanitizer = inject(DomSanitizer);

  constructor() {
    this.urlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(this.appConfig.mapUrl);
  }
}

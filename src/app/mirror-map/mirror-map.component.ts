import { Component, ElementRef, Inject, PLATFORM_ID, ViewChild } from "@angular/core";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import iframeResizer from "@iframe-resizer/parent";
import { CAUR_MAP_URL } from "../types";

@Component({
    selector: "app-mirror-map",
    standalone: true,
    imports: [],
    templateUrl: "./mirror-map.component.html",
    styleUrl: "./mirror-map.component.css",
})
export class MirrorMapComponent {
    url: string = CAUR_MAP_URL;
    urlSafe: SafeResourceUrl;
    // @ts-ignore
    @ViewChild("iframe", { static: false }) iframe: ElementRef;

    constructor(
        @Inject(PLATFORM_ID) platformId: Object,
        public sanitizer: DomSanitizer,
    ) {
        this.urlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(this.url);
    }

    ngAfterViewInit(): void {
        this.iframe.nativeElement.onload = () => {
            iframeResizer({ license: "GPLv3" }, this.iframe.nativeElement);
        };
    }
}

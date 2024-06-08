import { isPlatformBrowser, NgOptimizedImage } from "@angular/common"
import { Component, ElementRef, Inject, PLATFORM_ID, ViewChild } from "@angular/core"
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser"
import iframeResizer from "@iframe-resizer/parent"
import { CAUR_HOME_URL } from "../types"

@Component({
    selector: "app-chaotic-attractor",
    standalone: true,
    templateUrl: "./chaotic-attractor.component.html",
    styleUrl: "./chaotic-attractor.component.css",
    imports: [NgOptimizedImage],
})
export class ChaoticAttractorComponent {
    // Many thanks for adapting the original applet and letting us use it!
    // Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)
    // Copyright (c) 2018 Juan Carlos Ponce Campuzano
    url = CAUR_HOME_URL + "aizawa"
    urlSafe: SafeResourceUrl
    displayInteractive: boolean = true
    isMobile: boolean = false

    // @ts-ignore
    @ViewChild("iframe", { static: false }) iframe: ElementRef

    constructor(
        @Inject(PLATFORM_ID) platformId: Object,
        public sanitizer: DomSanitizer,
    ) {
        this.urlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(this.url)
        this.checkIfExists(platformId)
        this.isMobile = this.checkIfMobile()
    }

    ngAfterViewInit(): void {
        this.iframe.nativeElement.onload = () => {
            iframeResizer({ license: "GPLv3", direction: "horizontal" }, this.iframe.nativeElement)
        }
    }

    /**
     * Check if the platform is a browser and then checks if the iframe URL exists.
     * @param platformId The platform ID.
     * @private
     */
    private checkIfExists(platformId: Object): void {
        if (isPlatformBrowser(platformId)) {
            const request = new XMLHttpRequest()
            request.open("GET", this.urlSafe.toString(), false)
            request.send()
            if (request.status !== 200) {
                this.displayInteractive = false
            }
        }
    }

    /**
     * Check if the user is on a mobile device.
     * https://dev.to/timhuang/a-simple-way-to-detect-if-browser-is-on-a-mobile-device-with-javascript-44j3
     * @returns True if the user is on a mobile device, false otherwise.
     * @private
     */
    private checkIfMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    }
}

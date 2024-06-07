import { NgOptimizedImage, isPlatformBrowser } from "@angular/common"
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
    // @ts-ignore
    @ViewChild("iframe", { static: false }) iframe: ElementRef

    constructor(
        @Inject(PLATFORM_ID) platformId: Object,
        public sanitizer: DomSanitizer,
    ) {
        this.urlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(this.url)
        this.checkIfExists(platformId)
    }

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

    ngAfterViewInit(): void {
        this.iframe.nativeElement.onload = () => {
            iframeResizer({ license: "GPLv3", direction: "horizontal" }, this.iframe.nativeElement)
        }
    }
}

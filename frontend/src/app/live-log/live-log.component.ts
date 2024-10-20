import { AfterViewInit, Component, type ElementRef, Input, OnChanges, ViewChild } from "@angular/core"
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser"

@Component({
    selector: "app-live-log",
    standalone: true,
    imports: [],
    templateUrl: "./live-log.component.html",
    styleUrl: "./live-log.component.css",
})
export class LiveLogComponent implements AfterViewInit, OnChanges {
    @Input() url: string | undefined
    @ViewChild("iframe", { static: false }) iframe = {} as ElementRef
    showIframe = true
    urlSafe: SafeResourceUrl

    constructor(public sanitizer: DomSanitizer) {
        this.urlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(this.url ? this.url : "")
    }

    ngAfterViewInit(): void {
        if (this.url) {
            this.urlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(this.url)
        } else {
            console.error("No URL provided for live log")
        }
    }

    ngOnChanges(): void {
        if (this.url) {
            // This is a workaround to force the iframe to reload with the new URL
            this.urlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(this.url)
            this.showIframe = false
            setTimeout(() => {
                this.showIframe = true
            }, 50)
        } else {
            console.error("No URL provided for live log")
        }
    }
}

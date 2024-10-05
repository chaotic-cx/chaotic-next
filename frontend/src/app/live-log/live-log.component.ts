import { AfterViewInit, Component, type ElementRef, Inject, Input, PLATFORM_ID, ViewChild } from "@angular/core"
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser"

@Component({
    selector: "app-live-log",
    standalone: true,
    imports: [],
    templateUrl: "./live-log.component.html",
    styleUrl: "./live-log.component.css"
})
export class LiveLogComponent implements AfterViewInit {
    @Input() url: string | undefined
    @ViewChild("iframe", { static: false }) iframe = {} as ElementRef
    urlSafe: SafeResourceUrl

    constructor(
        @Inject(PLATFORM_ID) platformId: Object,
        public sanitizer: DomSanitizer
    ) {
        this.urlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(this.url ? this.url : "")
    }

    ngAfterViewInit(): void {
        if (this.url) {
            this.urlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(this.url ? this.url : "")
        } else {
            console.error("No URL provided for live log")
        }
    }
}

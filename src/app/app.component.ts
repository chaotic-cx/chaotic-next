import { NgOptimizedImage, isPlatformBrowser } from "@angular/common"
import { Component, Inject, OnInit, PLATFORM_ID, ViewEncapsulation } from "@angular/core"
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router"
import { initFlowbite } from "flowbite"
import { Highlight } from "ngx-highlightjs"
import { StatusComponent } from "./status/status.component"

@Component({
    selector: "app-root",
    standalone: true,
    imports: [RouterOutlet, StatusComponent, RouterLink, RouterLinkActive, NgOptimizedImage, Highlight],
    templateUrl: "./app.component.html",
    styleUrl: "./app.component.css",
    encapsulation: ViewEncapsulation.None,
})
export class AppComponent implements OnInit {
    title = "chaotic-frontend"

    constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

    ngOnInit(): void {
        if (isPlatformBrowser(this.platformId)) {
            initFlowbite()
        }
    }
}

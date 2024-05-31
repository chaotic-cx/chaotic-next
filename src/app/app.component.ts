import { Component, Inject, OnInit, PLATFORM_ID, ViewEncapsulation } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { initFlowbite } from "flowbite";
import { isPlatformBrowser, NgOptimizedImage } from "@angular/common";
import { StatusComponent } from "./status/status.component";

@Component({
    selector: "app-root",
    standalone: true,
    imports: [RouterOutlet, StatusComponent, RouterLink, RouterLinkActive, NgOptimizedImage],
    templateUrl: "./app.component.html",
    styleUrl: "./app.component.css",
    encapsulation: ViewEncapsulation.None,
})
export class AppComponent implements OnInit {
    title = "chaotic-frontend";

    constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

    ngOnInit(): void {
        if (isPlatformBrowser(this.platformId)) {
            initFlowbite();
        }
    }
}

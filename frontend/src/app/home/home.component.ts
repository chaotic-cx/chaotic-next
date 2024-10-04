import { loadTheme } from "@./shared-lib"
import { NgOptimizedImage } from "@angular/common"
import { AfterViewInit, Component, ElementRef, Renderer2 } from "@angular/core"
import { RouterLink, RouterLinkActive } from "@angular/router"
import { ChaoticAttractorComponent } from "../chaotic-attractor/chaotic-attractor.component"
import { MirrorMapComponent } from "../mirror-map/mirror-map.component"
import { NewsChannelComponent } from "../news-channel/news-channel.component"

@Component({
    selector: "app-home",
    standalone: true,
    imports: [
        NgOptimizedImage,
        RouterLink,
        RouterLinkActive,
        ChaoticAttractorComponent,
        MirrorMapComponent,
        NewsChannelComponent,
    ],
    templateUrl: "./home.component.html",
    styleUrl: "./home.component.css",
})
export class HomeComponent implements AfterViewInit {
    currentTheme: undefined | string = "mocha"

    constructor(
        private el: ElementRef,
        private renderer: Renderer2,
    ) {}

    ngAfterViewInit(): void {
        const savedTheme = localStorage.getItem("theme")
        if (savedTheme) {
            this.currentTheme = savedTheme
        }
    }

    toggleTheme(): void {
        const appCtp = document.getElementById("app-ctp")

        if (appCtp === null) return
        const classList = appCtp.classList

        // Need to change this if classes every get changed or rearranged
        switch (this.currentTheme) {
            case "mocha":
                classList.remove("mocha")
                this.currentTheme = loadTheme("latte", this.renderer, this.el)
                localStorage.setItem("theme", "latte")
                break
            case "latte":
                classList.remove("latte")
                this.currentTheme = loadTheme("frappe", this.renderer, this.el)
                localStorage.setItem("theme", "frappe")
                break
            case "frappe":
                classList.remove("frappe")
                this.currentTheme = loadTheme(
                    "macchiato",
                    this.renderer,
                    this.el,
                )
                localStorage.setItem("theme", "macchiato")
                break
            case "macchiato":
                classList.remove("macchiato")
                this.currentTheme = loadTheme("mocha", this.renderer, this.el)
                localStorage.setItem("theme", "mocha")
        }
    }
}

import { NgOptimizedImage } from "@angular/common"
import { Component, ElementRef, Renderer2 } from "@angular/core"
import { RouterLink, RouterLinkActive } from "@angular/router"
import { flavors } from "@catppuccin/palette"
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
export class HomeComponent {
    currentTheme = "mocha"

    constructor(
        private el: ElementRef,
        private renderer: Renderer2,
    ) {}
    toggleTheme(): void {
        const appCtp = document.getElementById("app-ctp")
        // @ts-ignore
        const classList = appCtp.classList

        // Need to change this if classes every get changed or rearranged
        switch (this.currentTheme) {
            case "mocha":
                classList.remove("mocha")
                classList.add("latte")
                this.currentTheme = "latte"
                this.renderer.setStyle(
                    this.el.nativeElement.ownerDocument.body,
                    "backgroundColor",
                    flavors.latte.colors.base.hex,
                )
                break
            case "latte":
                classList.remove("latte")
                classList.add("frappe")
                this.currentTheme = "frappe"
                this.renderer.setStyle(
                    this.el.nativeElement.ownerDocument.body,
                    "backgroundColor",
                    flavors.frappe.colors.base.hex,
                )
                break
            case "frappe":
                classList.remove("frappe")
                classList.add("macchiato")
                this.currentTheme = "macchiato"
                this.renderer.setStyle(
                    this.el.nativeElement.ownerDocument.body,
                    "backgroundColor",
                    flavors.macchiato.colors.base.hex,
                )
                break
            case "macchiato":
                classList.remove("macchiato")
                classList.add("mocha")
                this.currentTheme = "mocha"
                this.renderer.setStyle(
                    this.el.nativeElement.ownerDocument.body,
                    "backgroundColor",
                    flavors.mocha.colors.base.hex,
                )
        }
    }
}

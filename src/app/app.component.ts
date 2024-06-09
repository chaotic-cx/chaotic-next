import { NgOptimizedImage } from "@angular/common"
import { Component, ElementRef, OnInit, Renderer2, ViewEncapsulation } from "@angular/core"
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router"
import TimeAgo from "javascript-time-ago"
import en from "javascript-time-ago/locale/en"
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

    constructor(
        private el: ElementRef,
        private renderer: Renderer2,
    ) {}

    ngOnInit(): void {
        this.renderer.setStyle(this.el.nativeElement.ownerDocument.body, "backgroundColor", "#1e1e2e")
        TimeAgo.addDefaultLocale(en)
    }
}

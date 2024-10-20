import { MenuBarLinks } from "@./shared-lib"
import { NgClass, NgOptimizedImage, NgStyle } from "@angular/common"
import { Component } from "@angular/core"
import { RouterLink } from "@angular/router"

@Component({
    selector: "app-menubar",
    standalone: true,
    imports: [NgClass, NgStyle, RouterLink, NgOptimizedImage],
    templateUrl: "./menubar.component.html",
    styleUrl: "./menubar.component.css",
})
export class MenubarComponent {
    items: MenuBarLinks = [
        {
            title: "Home",
            routerLink: "/",
        },
        {
            title: "Get Started",
            routerLink: "/docs",
        },
        {
            title: "Build Status",
            routerLink: "/status",
        },
        {
            title: "Deploy log",
            routerLink: "/deploy-log",
        },
        {
            title: "Package List",
            routerLink: "/package-list",
        },
        {
            title: "Package Stats",
            routerLink: "/stats",
        },
        {
            title: "Memorial v2",
            routerLink: "/memorial-v2",
        },
        {
            title: "About",
            routerLink: "/about",
        },
    ]
}

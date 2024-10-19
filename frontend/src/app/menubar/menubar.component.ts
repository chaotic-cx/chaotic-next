import { MenuBarLinks } from "@./shared-lib";
import { NgClass, NgStyle } from "@angular/common";
import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";

@Component({
    selector: "app-menubar",
    standalone: true,
    imports: [NgClass, NgStyle, RouterLink],
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
            title: "Docs",
            routerLink: "/docs",
        },
        {
            title: "Status",
            routerLink: "/status",
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
    ];
}

import { Component, Inject, PLATFORM_ID } from "@angular/core";
import { Highlight } from "ngx-highlightjs";
import hljs from "highlight.js";
import { CopyButtonPlugin } from "../utils/hljs-copybutton";
import { CAUR_PRIMARY_KEY } from "../types";
import { isPlatformBrowser } from "@angular/common";

@Component({
    selector: "app-docs",
    standalone: true,
    templateUrl: "./docs.component.html",
    styleUrl: "./docs.component.css",
    imports: [Highlight],
})
export class DocsComponent {
    isBrowser = true;

    ngAfterViewInit() {
        if (this.isBrowser) {
            setTimeout(() => {
                hljs.addPlugin(new CopyButtonPlugin());
                hljs.highlightAll();
            }, 200);
        }
    }

    constructor(@Inject(PLATFORM_ID) platformId: Object) {
        // Prevent document is not defined errors during building / SSR
        this.isBrowser = isPlatformBrowser(platformId);
    }

    installRepo =
        `pacman-key --recv-key ${CAUR_PRIMARY_KEY} --keyserver keyserver.ubuntu.com\n` +
        `pacman-key --lsign-key ${CAUR_PRIMARY_KEY}\n` +
        "pacman -U 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-keyring.pkg.tar.zst'\n" +
        "pacman -U 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-mirrorlist.pkg.tar.zst'\n";
    appendRepo = "[chaotic-aur]\nInclude = /etc/pacman.d/chaotic-mirrorlist";
    installPackage = "pacman -S chaotic-aur/mesa-tkg-git";
    installPackageParu = "paru -S chaotic-aur/firefox-hg";
    powerpillUsage = "sudo pacman -Sy\nsudo powerpill -Su\nparu -Su";
    ignorePkg = "IgnorePkg = ...";
}

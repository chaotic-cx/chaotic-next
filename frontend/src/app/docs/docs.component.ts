import { CAUR_PRIMARY_KEY } from "@./shared-lib"
import { isPlatformBrowser } from "@angular/common"
import {
    type AfterViewInit,
    Component,
    Inject,
    PLATFORM_ID,
} from "@angular/core"
import hljs from "highlight.js"
import { Highlight } from "ngx-highlightjs"
import { CopyButtonPlugin } from "./hljs-copybutton"

@Component({
    selector: "app-docs",
    standalone: true,
    templateUrl: "./docs.component.html",
    styleUrl: "./docs.component.css",
    imports: [Highlight],
})
export class DocsComponent implements AfterViewInit {
    isBrowser = true
    installRepo =
        `pacman-key --recv-key ${CAUR_PRIMARY_KEY} --keyserver keyserver.ubuntu.com\n` +
        `pacman-key --lsign-key ${CAUR_PRIMARY_KEY}\n` +
        "pacman -U 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-keyring.pkg.tar.zst'\n" +
        "pacman -U 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-mirrorlist.pkg.tar.zst'\n"
    appendRepo = "[chaotic-aur]\nInclude = /etc/pacman.d/chaotic-mirrorlist"
    installPackage = "pacman -S chaotic-aur/mesa-tkg-git"
    installPackageParu = "paru -S chaotic-aur/firefox-hg"
    powerpillUsage = "sudo pacman -Sy\nsudo powerpill -Su\nparu -Su"
    ignorePkg = "IgnorePkg = ..."

    constructor(@Inject(PLATFORM_ID) platformId: Object) {
        // Prevent document is not defined errors during building / SSR
        this.isBrowser = isPlatformBrowser(platformId)
    }

    ngAfterViewInit() {
        if (this.isBrowser) {
            setTimeout(() => {
                hljs.addPlugin(new CopyButtonPlugin())
                hljs.highlightAll()
            }, 200)
        }
    }
}

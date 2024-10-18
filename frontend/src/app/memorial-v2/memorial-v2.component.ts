import { NgOptimizedImage } from "@angular/common";
import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";

@Component({
    selector: "app-memorial-v2",
    standalone: true,
    imports: [NgOptimizedImage, RouterLink],
    templateUrl: "./memorial-v2.component.html",
    styleUrl: "./memorial-v2.component.css",
})
export class MemorialV2Component {
    desktops: string[] = [
        "AnkurAlpha.png",
        "FameWolf.jpg",
        "anispwyn.png",
        "dr460nf1r3.png",
        "elite.jpg",
        "icar.jpg",
        "victorsouzaleal.png",
        "yada.png",
        "zoeruda.jpg",
    ];
    terms: string[] = ["darian.png", "dr460nf1r3.png", "elite.jpg", "immortalis.png", "juest.jpg", "yada.png"];
    desktopLinks: string[] = [];
    termLinks: string[] = [];

    constructor() {
        for (const filename of this.desktops) {
            const baseUrl = "https://raw.githubusercontent.com/chaotic-cx/memorial-v2/main/desktops/";
            this.desktopLinks.push(baseUrl + filename);
        }
        for (const filename of this.terms) {
            const baseUrl = "https://raw.githubusercontent.com/chaotic-cx/memorial-v2/main/terminals/";
            this.termLinks.push(baseUrl + filename);
        }
    }
}

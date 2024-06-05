import { Component } from "@angular/core";
import { NgOptimizedImage } from "@angular/common";
import { RouterLink, RouterLinkActive } from "@angular/router";
import { ChaoticAttractorComponent } from "../chaotic-attractor/chaotic-attractor.component";
import { MirrorMapComponent } from "../mirror-map/mirror-map.component";

@Component({
    selector: "app-home",
    standalone: true,
    imports: [NgOptimizedImage, RouterLink, RouterLinkActive, ChaoticAttractorComponent, MirrorMapComponent],
    templateUrl: "./home.component.html",
    styleUrl: "./home.component.css",
})
export class HomeComponent {}

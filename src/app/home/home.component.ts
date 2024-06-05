import { Component } from "@angular/core";
import { NgOptimizedImage } from "@angular/common";
import { RouterLink, RouterLinkActive } from "@angular/router";
import { ChaoticAttractorComponent } from "../chaotic-attractor/chaotic-attractor.component";

@Component({
    selector: "app-home",
    standalone: true,
    imports: [NgOptimizedImage, RouterLink, RouterLinkActive, ChaoticAttractorComponent],
    templateUrl: "./home.component.html",
    styleUrl: "./home.component.css",
})
export class HomeComponent {}

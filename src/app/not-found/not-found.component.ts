import { NgOptimizedImage } from "@angular/common"
import { Component } from "@angular/core"

@Component({
    selector: "app-not-found",
    standalone: true,
    imports: [NgOptimizedImage],
    templateUrl: "./not-found.component.html",
    styleUrl: "./not-found.component.css",
})
export class NotFoundComponent {}

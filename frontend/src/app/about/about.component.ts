import type { TeamList } from "@./shared-lib"
import { NgOptimizedImage } from "@angular/common"
import { Component } from "@angular/core"

@Component({
    selector: "app-about",
    standalone: true,
    imports: [NgOptimizedImage],
    templateUrl: "./about.component.html",
    styleUrl: "./about.component.css",
})
export class AboutComponent {
    team: TeamList = [
        {
            name: "Nico Jensch",
            github: "dr460nf1r3",
            role: "Lead Maintainer",
        },
        {
            name: "TNE",
            github: "JustTNE",
            role: "Infra maintainer",
        },
        {
            name: "Pedro H. Lara Campos",
            github: "PedroHLC",
            role: "Founder",
        },
        {
            name: "Paulo Matias",
            github: "thotypous",
            role: "Former TU, Co-founder",
        },
        {
            name: "Technetium1",
            github: "technetium1",
            role: "Package maintenance",
        },
        {
            name: "xiota",
            github: "xiota",
            role: "Package maintenance",
        },
        {
            name: "SolarAquarion",
            github: "SolarAquarion",
            role: "Package maintenance",
        },
        {
            name: "LordKitsuna",
            github: "lordkitsuna",
            role: "Former kernel builder",
        },
        {
            name: "João Figueiredo",
            github: "IslandC0der",
            role: "KDE git packages",
        },
        {
            name: "Alexjp",
            github: "alexjp",
            role: "KDE git packages",
        },
        {
            name: "Rustem B.",
            github: "RustemB",
            role: "Package maintenance",
        },
    ]

    constructor() {
        // Construct avatar URLs
        for (const member of this.team) {
            member.avatarUrl = `https://github.com/${member.github}.png`
        }
    }
}

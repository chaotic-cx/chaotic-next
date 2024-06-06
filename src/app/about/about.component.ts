import { Component } from "@angular/core";
import { TeamList } from "../types";
import { NgOptimizedImage } from "@angular/common";

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
            name: "Pedro H. Lara Campos",
            github: "PedroHLC",
            role: "Founder",
        },
        {
            name: "Paulo Matias",
            github: "thotypous",
            role: "Past Trusted User, Co-founder",
        },
        {
            name: "TNE",
            github: "JustTNE",
            role: "Sysadmin",
        },
        {
            name: "Technetium1",
            github: "technetium1",
            role: "General package maintenance",
        },
        {
            name: "xiota",
            github: "xiota",
            role: "General package maintenance",
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
            role: "KDE's -git packages",
        },
        {
            name: "Alexjp",
            github: "alexjp",
            role: "KDE's git packages",
        },
        {
            name: "Rustem B.",
            github: "RustemB",
            role: "General package maintenance",
        },
    ];

    constructor() {
        // Construct avatar URLs
        for (const member of this.team) {
            member.avatarUrl = `https://github.com/${member.github}.png`;
        }
    }
}

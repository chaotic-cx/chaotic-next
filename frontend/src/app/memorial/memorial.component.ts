import { NgOptimizedImage } from "@angular/common"
import { Component } from "@angular/core"

@Component({
    selector: "app-memorial",
    standalone: true,
    imports: [NgOptimizedImage],
    templateUrl: "./memorial.component.html",
    styleUrl: "./memorial.component.css",
})
export class MemorialComponent {
    desktops: string[] = [
        "PROxZIMA.png",
        "alexjp.jpg",
        "aryan.png",
        "ash-2.png",
        "ash.png",
        "austin.png",
        "bernard-wayfire.png",
        "bernard.png",
        "dr460nf1r3.png",
        "ernesto.png",
        "fcinq.jpg",
        "filo.jpg",
        "fra.png",
        "iDigitalFlame.png",
        "icarns.png",
        "jeafran.png",
        "kevin.png",
        "kevin_nadar.png",
        "lesnake.jpg",
        "memorial.png",
        "odiousimp.png",
        "osvarcha.png",
        "pedrohlc.png",
        "redgloboli.png",
        "sgs_1.jpg",
        "sgs_2.jpg",
        "smoky.png",
        "sonya.png",
        "sugaya.png",
        "virusz4274.png",
        "vnepogodin.png",
        "zany130.png",
    ]
    terms: string[] = [
        "AvinashReddy3108.png",
        "ahmubashshir.png",
        "arch04.png",
        "b.jpg",
        "dr460nf1r3.png",
        "dr460nf1r3_vps.png",
        "fcinq.png",
        "freebird.png",
        "garuda_builder.png",
        "hisham.png",
        "jorge.png",
        "kenny.jpg",
        "librewish.png",
        "ninioArtillero.png",
        "pedrohlc.png",
        "rohit-arm.jpg",
        "sgs.png",
        "snowdan.jpg",
        "squirrellyDave.png",
        "swappy.png",
        "thotypous.jpg",
        "tne.png",
        "virusz4274.png",
        "vnepogodin.png",
        "x11guy.png",
        "zoe.png",
    ]
    desktopLinks: string[] = []
    termLinks: string[] = []
    specialTreatmentDesktops: string[] = [
        "alexjp.jpg",
        "fcinq.jpg",
        "virusz4274.png",
    ]
    specialTreatmentTerms: string[] = [
        "kenny.jpg",
        "rohit-arm.jpg",
        "snowdan.jpg",
    ]

    constructor() {
        for (const filename of this.desktops) {
            const baseUrl =
                "https://raw.githubusercontent.com/chaotic-aur/memorial/main/desktops/"
            if (
                !this.specialTreatmentDesktops.some((item) => {
                    return item === filename
                })
            ) {
                this.desktopLinks.push(baseUrl + filename)
            }
        }
        for (const filename of this.terms) {
            const baseUrl =
                "https://raw.githubusercontent.com/chaotic-aur/memorial/main/terms/"
            if (
                !this.specialTreatmentTerms.some((item) => {
                    return item === filename
                })
            ) {
                this.termLinks.push(baseUrl + filename)
            }
        }
    }
}

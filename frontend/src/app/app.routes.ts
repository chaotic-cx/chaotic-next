import { NgModule } from "@angular/core";
import { RouterModule, type Routes } from "@angular/router";
import { AboutComponent } from "./about/about.component";
import { DeployLogFullComponent } from "./deploy-log-full/deploy-log-full.component";
import { DocsComponent } from "./docs/docs.component";
import { HomeComponent } from "./home/home.component";
import { MemorialV2Component } from "./memorial-v2/memorial-v2.component";
import { MemorialComponent } from "./memorial/memorial.component";
import { NotFoundComponent } from "./not-found/not-found.component";
import { PackageListComponent } from "./package-list/package-list.component";
import { StatsPage } from "./stats-page/stats-page";
import { StatusComponent } from "./status/status.component";
import {
    animate,
    AnimationGroupMetadata,
    AnimationQueryMetadata,
    AnimationTriggerMetadata,
    group,
    query,
    style,
    transition,
    trigger,
} from "@angular/animations";

export const routes: Routes = [
    {
        title: "Chaotic-AUR",
        path: "",
        component: HomeComponent,
        data: { animationState: "1" },
    },
    {
        title: "Get Started",
        path: "docs",
        component: DocsComponent,
        data: { animationState: "2" },
    },
    {
        title: "Build Status",
        path: "status",
        component: StatusComponent,
        data: { animationState: "3" },
    },
    {
        title: "Deploy Log",
        path: "deploy-log",
        component: DeployLogFullComponent,
        data: { animationState: "4" },
    },
    {
        title: "Package List",
        path: "package-list",
        component: PackageListComponent,
        data: { animationState: "5" },
    },
    {
        title: "Package Stats",
        path: "stats",
        component: StatsPage,
        data: { animationState: "6" },
    },
    {
        title: "Memorial 2024",
        path: "memorial-v2",
        component: MemorialV2Component,
        data: { animationState: "7" },
    },
    {
        title: "About",
        path: "about",
        component: AboutComponent,
        data: { animationState: "8" },
    },
    {
        title: "Memorial 2021",
        path: "memorial",
        component: MemorialComponent,
        data: { animationState: "null" },
    },
    {
        title: "Not Found",
        path: "not-found",
        component: NotFoundComponent,
        data: { animationState: "null" },
    },
    {
        path: "**",
        redirectTo: "not-found",
        data: { animationState: "null" },
    },
];

const fade: (AnimationQueryMetadata | AnimationGroupMetadata)[] = [
    query(":enter, :leave", style({ position: "fixed", width: "100%" }), { optional: true }),
    query(":enter", [style({ opacity: 0 })], { optional: true }),
    group([
        query(":leave", [animate("0.4s ease-out", style({ opacity: 0 }))], { optional: true }),
        query(":enter", [style({ opacity: 0 }), animate("0.4s ease-out", style({ opacity: 1 }))], { optional: true }),
    ]),
];

const fadeInFromDirection = (direction: string): (AnimationQueryMetadata | AnimationGroupMetadata)[] => [
    query(":enter, :leave", style({ position: "fixed", width: "100%" }), { optional: true }),
    group([
        query(
            ":enter",
            [
                style({
                    transform: `translateX(${direction === "backward" ? "-" : ""}15%)`,
                    opacity: 0,
                }),
                animate("0.1s ease-out", style({ transform: "translateX(0%)", opacity: 1 })),
            ],
            { optional: true },
        ),
        query(":leave", [style({ transform: "translateX(0%)" }), animate("0.3s ease-out", style({ opacity: 0 }))], {
            optional: true,
        }),
    ]),
];

export const routeAnimations: AnimationTriggerMetadata = trigger("routerTransition", [
    transition(
        "0 => 1, 1 => 2, 2 => 3, 3 => 4, 4 => 5, 5 => 6, 6 => 7, 7 => 8, 8 => 9",
        fadeInFromDirection("forward"),
    ),
    transition(
        "9 => 8, 8 => 7, 7 => 6, 6 => 5, 5 => 4, 4 => 3, 3 => 2, 2 => 1, 1 => 0",
        fadeInFromDirection("backward"),
    ),
    transition("* => null", fade),
]);

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule],
})
export class AppRoutingModule {}

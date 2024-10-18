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

export const routes: Routes = [
    {
        title: "Chaotic-AUR",
        path: "",
        component: HomeComponent,
    },
    {
        title: "Build Status",
        path: "status",
        component: StatusComponent,
    },
    {
        title: "Deploy Log",
        path: "deploy-log",
        component: DeployLogFullComponent,
    },
    {
        title: "Memorial 2021",
        path: "memorial",
        component: MemorialComponent,
    },
    {
        title: "Memorial 2024",
        path: "memorial-v2",
        component: MemorialV2Component,
    },
    {
        title: "About",
        path: "about",
        component: AboutComponent,
    },
    {
        title: "Documentation",
        path: "docs",
        component: DocsComponent,
    },
    {
        title: "Package Stats",
        path: "stats",
        component: StatsPage,
    },
    {
        title: "Package List",
        path: "package-list",
        component: PackageListComponent,
    },
    {
        title: "Not Found",
        path: "not-found",
        component: NotFoundComponent,
    },
    {
        path: "**",
        redirectTo: "not-found",
    },
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule],
})
export class AppRoutingModule {}

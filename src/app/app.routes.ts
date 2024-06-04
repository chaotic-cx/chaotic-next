import { RouterModule, Routes } from "@angular/router";
import { StatusComponent } from "./status/status.component";
import { NgModule } from "@angular/core";
import { HomeComponent } from "./home/home.component";
import { MemorialComponent } from "./memorial/memorial.component";
import { AboutComponent } from "./about/about.component";
import { DocsComponent } from "./docs/docs.component";
import { StatsPage } from "./stats-page/stats-page";
import { NotFoundComponent } from "./not-found/not-found.component";

export const routes: Routes = [
    {
        path: "",
        component: HomeComponent,
    },
    {
        path: "status",
        component: StatusComponent,
    },
    {
        path: "memorial",
        component: MemorialComponent,
    },
    {
        path: "about",
        component: AboutComponent,
    },
    {
        path: "docs",
        component: DocsComponent,
    },
    {
        path: "memorial",
        component: MemorialComponent,
    },
    {
        path: "stats",
        component: StatsPage,
    },
    {
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

import { NgModule } from "@angular/core"
import { RouterModule, Routes } from "@angular/router"
import { AboutComponent } from "./about/about.component"
import { DeployLogFullComponent } from "./deploy-log-full/deploy-log-full.component"
import { DocsComponent } from "./docs/docs.component"
import { HomeComponent } from "./home/home.component"
import { MemorialComponent } from "./memorial/memorial.component"
import { NotFoundComponent } from "./not-found/not-found.component"
import { StatsPage } from "./stats-page/stats-page"
import { StatusComponent } from "./status/status.component"

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
        path: "deploy-log",
        component: DeployLogFullComponent,
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
]

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule],
})
export class AppRoutingModule {}

import { ApplicationConfig, provideZoneChangeDetection } from "@angular/core"
import { provideClientHydration } from "@angular/platform-browser"
import { provideRouter } from "@angular/router"
import { provideHighlightOptions } from "ngx-highlightjs"
import { routes } from "./app.routes"

export const appConfig: ApplicationConfig = {
    providers: [
        provideZoneChangeDetection({ eventCoalescing: true }),
        provideRouter(routes),
        provideClientHydration(),
        provideHighlightOptions({
            coreLibraryLoader: () => import("highlight.js/lib/core"),
            languages: {
                shell: () => import("highlight.js/lib/languages/shell"),
            },
        }),
    ],
}

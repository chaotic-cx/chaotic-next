import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import type { ApplicationConfig } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideHighlightOptions } from "ngx-highlightjs";
import { routes } from "./app.routes";
import { provideAnimations } from "@angular/platform-browser/animations";

export const appConfig: ApplicationConfig = {
    providers: [
        provideAnimations(),
        provideHighlightOptions({
            coreLibraryLoader: () => import("highlight.js/lib/core"),
            languages: {
                shell: () => import("highlight.js/lib/languages/shell"),
            },
        }),
        provideHttpClient(withInterceptorsFromDi()),
        provideRouter(routes),
    ],
};

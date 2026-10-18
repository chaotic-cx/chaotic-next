import { RenderMode, type ServerRoute } from '@angular/ssr';
import { APP_SHELL_PATH } from './app.routes';

/**
 * The build writes static files only, there is no rendering server.
 * Prerendered routes get their own HTML file. All other routes use the client shell.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'docs', renderMode: RenderMode.Prerender },
  { path: 'about', renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: 'code-of-conduct', renderMode: RenderMode.Prerender },
  { path: 'memorial', renderMode: RenderMode.Prerender },
  { path: 'memorial-v2', renderMode: RenderMode.Prerender },
  { path: 'memorial-v3', renderMode: RenderMode.Prerender },
  { path: 'not-found', renderMode: RenderMode.Prerender },
  { path: APP_SHELL_PATH, renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];

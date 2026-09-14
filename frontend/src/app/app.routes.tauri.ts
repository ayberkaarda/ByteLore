import { Routes } from '@angular/router';

import { SHARED_ROUTES } from './app.routes.shared';

/**
 * The desktop build's routes: the shared set, unwrapped.
 *
 * The web build puts a language segment in front of every address so that
 * each language is a page a search engine can index. Nothing indexes a
 * desktop window, and the segment would only put a language into addresses
 * nobody sees, links nobody shares and history entries nobody reads — so the
 * routes stay exactly as they were.
 *
 * This file replaces app.routes.ts in the `tauri` and `tauri-development`
 * build configurations. It does not import that file and that file does not
 * import this one: the pair only ever meet through app.routes.shared.ts,
 * which no build replaces.
 */
export const routes: Routes = SHARED_ROUTES;

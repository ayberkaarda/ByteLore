import { Routes } from '@angular/router';

import { SHARED_ROUTES } from './app.routes.shared';
import {
  LOCALE_ROUTE_PATH,
  followUrlLocale,
  preferredLocaleRedirect,
  supportedLocaleSegment,
} from './core/i18n/locale-route';

/**
 * The web build's routes: every screen, under a language segment.
 *
 * A canonical address per language is what makes the content indexable in
 * more than one of them — `/tr/tracks/java` and `/fr/tracks/java` are two
 * pages a search engine can hold, where one address whose language depends on
 * a stored preference is one page that answers differently to different
 * visitors.
 *
 * This file is replaced by app.routes.tauri.ts in the desktop build, where
 * nothing is crawled and an address carries no language. The routes both
 * builds share are in app.routes.shared.ts; what is here is only the wrapping.
 */
export const routes: Routes = [
  /*
   * A bare visit has not said which language it wants, so it is sent to the
   * one the interface resolved at startup. This is the only redirect in the
   * file: a language segment that is present and supported is honoured as
   * written even when it disagrees with the stored preference, because
   * following a link to a French page is itself a statement about which
   * language is wanted.
   */
  { path: '', pathMatch: 'full', redirectTo: preferredLocaleRedirect },
  {
    path: LOCALE_ROUTE_PATH,
    canMatch: [supportedLocaleSegment],
    resolve: { locale: followUrlLocale },
    children: SHARED_ROUTES,
  },
  /*
   * Reached when the first segment is not a language this application speaks —
   * `/xx/tracks`, or `/tracks` as written by a link from before the segment
   * existed. Both are bad addresses rather than preferences to interpret, and
   * the shared routes end in this same screen, so a reader gets one answer
   * whichever way they arrived at it.
   */
  {
    path: '**',
    loadComponent: () => import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];

import { inject } from '@angular/core';
import type { CanMatchFn, RedirectFunction, ResolveFn, UrlSegment } from '@angular/router';

import { LOCALES, type Locale } from '../platform/models';
import { LocaleService } from './locale.service';

/**
 * The path of the route that carries the interface language on the web build.
 *
 * The desktop build has no such route, and the helper that prefixes navigation
 * commands decides which of the two it is running under by looking for this
 * path in the router configuration — so the string is declared once and shared
 * rather than written out at each end.
 */
export const LOCALE_ROUTE_PATH = ':locale';

/** The route parameter the path above binds the segment to. */
export const LOCALE_ROUTE_PARAM = 'locale';

/** The segment where it is one of the four supported languages, else `null`. */
export function localeFromSegment(segment: string | undefined | null): Locale | null {
  return LOCALES.find((locale) => locale === segment) ?? null;
}

/**
 * Admits the language segment only for a language this application speaks.
 *
 * A guard rather than a regular expression in the path: a guard that refuses
 * lets matching continue past the route, so an address like `/xx/tracks` — or
 * `/tracks`, which is what a link written before this segment existed looks
 * like — reaches the catch-all and renders "not found". A pattern in the path
 * string can only fail the whole segment shape, which would leave nothing else
 * to answer with.
 *
 * An unknown language in the address bar is a bad link, not a preference, so
 * it is answered rather than redirected.
 */
export const supportedLocaleSegment: CanMatchFn = (_route, segments: UrlSegment[]) =>
  localeFromSegment(segments[0]?.path) !== null;

/**
 * Follows the language in the address, before the screen under it activates.
 *
 * Opening a French address is treated exactly as if the reader had used the
 * language switcher, because for a link someone followed or a URL they typed
 * it is the only statement of intent there is — so the choice is recorded as
 * theirs rather than applied for this visit only.
 *
 * This is a resolver and not something a component does on init: every screen
 * would need the same code, each would apply it one render too late, and the
 * first paint would be in the previous language.
 *
 * The comparison against the active locale is what keeps this from fighting
 * the other direction of the synchronisation — a segment that already agrees
 * with the interface is left alone rather than reapplied.
 */
export const followUrlLocale: ResolveFn<Locale | null> = async (route) => {
  const locale = localeFromSegment(route.params[LOCALE_ROUTE_PARAM] as string | undefined);
  const service = inject(LocaleService);
  if (locale !== null && locale !== service.current()) {
    await service.use(locale, true);
  }
  return locale;
};

/**
 * Where a bare visit goes: the preferred language's track list.
 *
 * The preference is resolved by the locale service rather than here, so the
 * address this sends someone to and the language the interface came up in are
 * one decision with one answer.
 */
export const preferredLocaleRedirect: RedirectFunction = () =>
  `/${inject(LocaleService).preferred()}/tracks`;

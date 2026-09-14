import { Injectable, effect, inject } from '@angular/core';
import { PRIMARY_OUTLET, Router, type UrlTree } from '@angular/router';

import type { Locale } from '../platform/models';
import { ActiveLocale } from './active-locale';
import { localeFromSegment } from './locale-route';

/**
 * The other half of the language synchronisation: when the interface language
 * changes, the address follows it.
 *
 * Without this, switching to French from the settings screen would leave an
 * English address describing a French page — and reloading, sharing or
 * bookmarking it would put the reader back where they started, because the
 * address is what the resolver reads on the way in.
 *
 * It watches the active locale rather than wrapping the service's method, so
 * every route in the application is covered by one place no matter what caused
 * the change. It lives outside `LocaleService` for a plainer reason: that
 * service is on the startup path and is used by screens that have no router at
 * all, and giving it a router dependency would make the language depend on
 * routing being configured.
 *
 * There is no loop. The resolver only applies a language the address already
 * names, and this only rewrites an address that names a different one, so each
 * direction finds the work already done when the other one triggers it.
 *
 * On the desktop build no address carries a language segment, so nothing here
 * ever fires — the check below finds no segment to replace.
 */
@Injectable({ providedIn: 'root' })
export class LocaleRouteSync {
  private readonly router = inject(Router);
  private readonly active = inject(ActiveLocale);

  constructor() {
    effect(() => {
      this.rewrite(this.active.value());
    });
  }

  private rewrite(locale: Locale): void {
    /*
     * A navigation that has been started but has not landed yet is the more
     * accurate statement of where the address is going: the resolver sets the
     * language while the navigation that carries it is still in flight, and
     * comparing against the address it is leaving would send a second
     * navigation to the place the first one is already heading.
     */
    const navigation = this.router.getCurrentNavigation();
    const tree: UrlTree =
      navigation === null
        ? this.router.parseUrl(this.router.url)
        : (navigation.finalUrl ?? navigation.extractedUrl);

    const segments = tree.root.children[PRIMARY_OUTLET]?.segments ?? [];
    const first = segments[0]?.path;
    if (localeFromSegment(first) === null || first === locale) {
      return;
    }

    void this.router.navigate([`/${locale}`, ...segments.slice(1).map((segment) => segment.path)], {
      queryParams: tree.queryParams,
      fragment: tree.fragment ?? undefined,
      /*
       * The same page in another language is not a second destination, so it
       * replaces the entry rather than stacking one: without this, going
       * back after a language switch would land on the same screen again and
       * bounce the language back with it.
       */
      replaceUrl: true,
    });
  }
}

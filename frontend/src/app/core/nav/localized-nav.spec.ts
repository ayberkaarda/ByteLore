import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type Routes } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { FakePlatformService } from '../../../testing/fake-platform.service';
import { routes as tauriRoutes } from '../../app.routes.tauri';
import { routes as webRoutes } from '../../app.routes';
import { ActiveLocale } from '../i18n/active-locale';
import { BundledTranslateLoader } from '../i18n/translations';
import { API_BASE_URL } from '../platform/api';
import { PlatformService } from '../platform/platform.service';
import { LocalizedNav } from './localized-nav';

/**
 * The same call sites run in both builds, so both real route files are handed
 * to the helper here rather than a stand-in. What decides the answer is which
 * route file the build was given, and a test that invented its own
 * configuration would pass whatever that file later became.
 *
 * The rest of the providers are what the web routes need to be navigated at
 * all — the segment resolver applies the language through the locale service —
 * and nothing here asserts on them.
 */
function configure(routes: Routes): LocalizedNav {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: 'https://api.example.test/api/v1' },
      { provide: PlatformService, useValue: new FakePlatformService() },
      provideTranslateService({
        loader: BundledTranslateLoader,
        fallbackLang: 'en',
        lang: 'en',
      }),
    ],
  });
  return TestBed.inject(LocalizedNav);
}

describe('LocalizedNav on the web build', () => {
  it('prefixes the language of the address being shown', async () => {
    const nav = configure(webRoutes);
    await TestBed.inject(Router).navigateByUrl('/tr/tracks');

    expect(nav.commands(['/tracks'])).toEqual(['/tr', 'tracks']);
  });

  it('spreads a multi-segment destination rather than nesting it', async () => {
    const nav = configure(webRoutes);
    await TestBed.inject(Router).navigateByUrl('/tr/tracks');

    // Only the first command is split on slashes by the router, so a
    // destination written as one string has to be taken apart here: left in
    // second place it would address a single segment called `admin%2Fblog`.
    expect(nav.commands(['/admin/blog', 'post-1'])).toEqual(['/tr', 'admin', 'blog', 'post-1']);
  });

  it('carries the deeper parts of a destination through untouched', async () => {
    const nav = configure(webRoutes);
    await TestBed.inject(Router).navigateByUrl('/de/tracks');

    expect(nav.commands(['/tracks', 'java', 'lessons', 'generics'])).toEqual([
      '/de',
      'tracks',
      'java',
      'lessons',
      'generics',
    ]);
  });

  it('falls back to the interface language where the address carries none', () => {
    const nav = configure(webRoutes);
    TestBed.inject(ActiveLocale).set('fr');

    // The screen that answers an unknown language sits outside the segment, so
    // its own links have no address to read one from. Without this fallback
    // they would resolve to that same screen and the reader would be stuck
    // there.
    expect(nav.commands(['/tracks'])).toEqual(['/fr', 'tracks']);
  });

  it('returns the same array for the same destination', () => {
    const nav = configure(webRoutes);

    // Not an optimisation: a binding that produced a new array on every check
    // would never compare equal to the one checked a moment before, which
    // development mode reports as an expression changing after it was checked.
    expect(nav.commands(['/tracks'])).toBe(nav.commands(['/tracks']));
  });

  it('rebuilds when the language changes', () => {
    const nav = configure(webRoutes);
    const active = TestBed.inject(ActiveLocale);

    active.set('en');
    expect(nav.commands(['/blog'])).toEqual(['/en', 'blog']);
    active.set('de');
    expect(nav.commands(['/blog'])).toEqual(['/de', 'blog']);
  });
});

describe('LocalizedNav on the desktop build', () => {
  it('leaves an absolute destination exactly as the call site wrote it', () => {
    const nav = configure(tauriRoutes);
    TestBed.inject(ActiveLocale).set('tr');

    // The interface is Turkish and the address still has no language in it:
    // the desktop routes have no segment to fill, and prefixing one would
    // address a route that does not exist.
    expect(nav.commands(['/tracks'])).toEqual(['/tracks']);
    expect(nav.commands(['/admin/blog', 'post-1'])).toEqual(['/admin/blog', 'post-1']);
  });

  it('resolves those commands against the desktop routes', async () => {
    const nav = configure(tauriRoutes);
    const router = TestBed.inject(Router);

    await router.navigate(nav.commands(['/blog']));

    expect(router.url).toBe('/blog');
  });
});

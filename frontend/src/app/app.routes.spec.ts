import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type Routes } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { FakePlatformService } from '../testing/fake-platform.service';
import { SHARED_ROUTES } from './app.routes.shared';
import { routes as tauriRoutes } from './app.routes.tauri';
import { routes as webRoutes } from './app.routes';
import { LocaleService } from './core/i18n/locale.service';
import { BundledTranslateLoader } from './core/i18n/translations';
import { API_BASE_URL } from './core/platform/api';
import type { Locale } from './core/platform/models';
import { PlatformService } from './core/platform/platform.service';

/**
 * The web build addresses every screen under a language segment and the
 * desktop build addresses none of them that way. Both shapes are exercised
 * here against the real route files, because the difference between them is
 * decided by a build-time file replacement that no amount of unit testing one
 * of the two would notice going wrong.
 */
async function configure(routes: Routes, locale: Locale = 'en'): Promise<void> {
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
  await TestBed.inject(LocaleService).initialize(locale);
}

/** The path of the configured route that answered the current address. */
function matchedPath(): string | undefined {
  return TestBed.inject(Router).routerState.snapshot.root.firstChild?.routeConfig?.path;
}

describe('web routes', () => {
  it('serves every shared screen under a language segment', async () => {
    await configure(webRoutes);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/tr/tracks');

    expect(router.url).toBe('/tr/tracks');
    expect(matchedPath()).toBe(':locale');
  });

  it('sends a visit that names only a language on to the track list', async () => {
    await configure(webRoutes);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/tr');

    expect(router.url).toBe('/tr/tracks');
  });

  it('keeps deep links working under the segment', async () => {
    await configure(webRoutes);
    const router = TestBed.inject(Router);

    // A slug-addressed deep link is what a shared address looks like, and it
    // is the whole reason the segment is in the path rather than in a query
    // parameter: this is one crawlable page per language.
    await router.navigateByUrl('/fr/tracks/java/lessons/generics');

    expect(router.url).toBe('/fr/tracks/java/lessons/generics');
    expect(TestBed.inject(LocaleService).current()).toBe('fr');
  });

  it('refuses a segment that is not a language this application speaks', async () => {
    await configure(webRoutes);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/xx/tracks');

    // Answered rather than redirected: an unknown language in the address bar
    // is a bad link, not a preference to honour. The address is left as typed
    // so the reader can see what they asked for.
    expect(router.url).toBe('/xx/tracks');
    expect(matchedPath()).toBe('**');
  });

  it('answers an address written without a language segment at all', async () => {
    await configure(webRoutes);
    const router = TestBed.inject(Router);

    // What a link from before this segment existed looks like. It reaches the
    // same screen as any other address that does not resolve, rather than
    // being silently rewritten into one that does.
    await router.navigateByUrl('/tracks');

    expect(matchedPath()).toBe('**');
  });

  it('sends a bare visit to the preferred language', async () => {
    await configure(webRoutes, 'fr');
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/');

    expect(router.url).toBe('/fr/tracks');
  });

  it('resolves the preferred language through the locale service, not a copy of it', async () => {
    await configure(webRoutes, 'de');
    const router = TestBed.inject(Router);

    // The same visit answers differently once the interface language differs,
    // which is what "one resolution" means in practice: nothing here decides
    // what "preferred" is on its own.
    await router.navigateByUrl('/');
    expect(router.url).toBe('/de/tracks');
  });

  it('follows the language in the address before the screen under it activates', async () => {
    await configure(webRoutes, 'en');
    const router = TestBed.inject(Router);
    const locale = TestBed.inject(LocaleService);

    await router.navigateByUrl('/fr/tracks');

    // Opening a French address is treated as the reader saying they want
    // French, because for a typed or followed link it is the only statement of
    // intent there is.
    expect(locale.current()).toBe('fr');
  });

  it('leaves a language segment that already agrees with the interface alone', async () => {
    await configure(webRoutes, 'tr');
    const router = TestBed.inject(Router);
    const locale = TestBed.inject(LocaleService);

    await router.navigateByUrl('/tr/blog');

    expect(locale.current()).toBe('tr');
    expect(router.url).toBe('/tr/blog');
  });

  it('keeps the shared routes as its only description of the screens', () => {
    const wrapper = webRoutes.find((route) => route.path === ':locale');
    // The wrapping file adds a segment and nothing else. A screen listed here
    // as well as in the shared file would be a second definition free to drift
    // from the desktop build's.
    expect(wrapper?.children).toBe(SHARED_ROUTES);
    expect(webRoutes.map((route) => route.path)).toEqual(['', ':locale', '**']);
  });
});

describe('desktop routes', () => {
  it('carries no language segment', () => {
    // Nothing indexes a desktop window, so a language in the address would
    // only appear in history entries nobody reads.
    expect(tauriRoutes).toBe(SHARED_ROUTES);
    expect(tauriRoutes.some((route) => route.path === ':locale')).toBe(false);
  });

  it('serves the shared screens at their bare addresses', async () => {
    await configure(tauriRoutes);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/tracks');

    expect(router.url).toBe('/tracks');
  });

  it('sends a bare visit to the track list with no language in the address', async () => {
    await configure(tauriRoutes, 'fr');
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/');

    expect(router.url).toBe('/tracks');
  });
});

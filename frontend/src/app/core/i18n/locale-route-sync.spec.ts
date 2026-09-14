import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter, type Routes } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { filter, firstValueFrom } from 'rxjs';

import { FakePlatformService } from '../../../testing/fake-platform.service';
import { routes as tauriRoutes } from '../../app.routes.tauri';
import { routes as webRoutes } from '../../app.routes';
import { API_BASE_URL } from '../platform/api';
import { PlatformService } from '../platform/platform.service';
import { LocaleRouteSync } from './locale-route-sync';
import { LocaleService } from './locale.service';
import { BundledTranslateLoader } from './translations';

async function configure(routes: Routes): Promise<void> {
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
  await TestBed.inject(LocaleService).initialize('en');
  // Constructing it is what arms the watch, exactly as the application's own
  // startup does. Nothing injects it afterwards.
  TestBed.inject(LocaleRouteSync);
}

/**
 * Switches the interface language and waits for whatever address change that
 * causes, or returns once it is clear there is none.
 *
 * The rewrite is a watch on the active language rather than something the
 * switch calls, so it lands one change-detection pass later; `tick` is what
 * runs that pass.
 */
async function useLocale(locale: 'en' | 'tr' | 'fr' | 'de'): Promise<void> {
  const router = TestBed.inject(Router);
  const landed = firstValueFrom(router.events.pipe(filter((e) => e instanceof NavigationEnd)));
  await TestBed.inject(LocaleService).use(locale);
  TestBed.tick();
  await Promise.race([landed, new Promise((resolve) => setTimeout(resolve, 50))]);
}

describe('LocaleRouteSync on the web build', () => {
  it('rewrites the language segment when the interface language changes', async () => {
    await configure(webRoutes);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/en/tracks');

    await useLocale('fr');

    // Without this the settings screen would leave an English address
    // describing a French page, and reloading or sharing it would put the
    // reader back in English — the address is what the resolver reads on the
    // way in.
    expect(router.url).toBe('/fr/tracks');
  });

  it('keeps the rest of the path and the query string', async () => {
    await configure(webRoutes);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/en/blog?page=2&q=jvm');

    await useLocale('de');

    expect(router.url).toBe('/de/blog?page=2&q=jvm');
  });

  it('does not fight the other direction', async () => {
    await configure(webRoutes);
    const router = TestBed.inject(Router);

    // Arriving at a Turkish address makes the resolver apply Turkish, which is
    // the same signal this watch listens to. It has to find the work already
    // done rather than start a navigation of its own.
    await router.navigateByUrl('/tr/tracks');
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(router.url).toBe('/tr/tracks');
    expect(TestBed.inject(LocaleService).current()).toBe('tr');
  });
});

describe('LocaleRouteSync on the desktop build', () => {
  it('leaves the address alone, because no address carries a language', async () => {
    await configure(tauriRoutes);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/tracks');

    await useLocale('tr');

    expect(router.url).toBe('/tracks');
    expect(TestBed.inject(LocaleService).current()).toBe('tr');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { FakePlatformService } from '../../testing/fake-platform.service';
import { BundledTranslateLoader } from '../core/i18n/translations';
import { PlatformService } from '../core/platform/platform.service';
import { ThemeService } from '../core/theme/theme.service';
import { ThemeSelect } from './theme-select';

describe('ThemeSelect', () => {
  let platform: FakePlatformService;
  let theme: ThemeService;

  beforeEach(() => {
    platform = new FakePlatformService();
    TestBed.configureTestingModule({
      providers: [
        { provide: PlatformService, useValue: platform },
        provideTranslateService({
          loader: BundledTranslateLoader,
          fallbackLang: 'en',
          lang: 'en',
        }),
      ],
    });
    theme = TestBed.inject(ThemeService);
    document.documentElement.removeAttribute('data-theme');
  });

  function render() {
    theme.initialize('LIGHT');
    const fixture = TestBed.createComponent(ThemeSelect);
    fixture.detectChanges();
    return fixture;
  }

  it('offers all three preferences, System included', () => {
    const fixture = render();
    const options = Array.from(
      fixture.nativeElement.querySelectorAll('option'),
    ) as HTMLOptionElement[];

    expect(options.map((option) => option.value)).toEqual(['SYSTEM', 'LIGHT', 'DARK']);
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'System',
      'Light',
      'Dark',
    ]);
  });

  it('carries the shared look and an accessible label', () => {
    const fixture = render();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;

    expect(select.classList).toContain('bl-select');
    expect(select.getAttribute('aria-label')).toBe('Theme');
  });

  it('reflects the current preference, not just the resolved theme', () => {
    const fixture = render();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;

    expect(select.value).toBe('LIGHT');
  });

  it('lets a user return to following the system', async () => {
    const fixture = render();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;

    select.value = 'SYSTEM';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(theme.preference()).toBe('SYSTEM');
  });

  it('records the choice through the platform service', async () => {
    const fixture = render();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;

    select.value = 'DARK';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(platform.preferenceWrites).toEqual([{ theme: 'DARK' }]);
  });
});

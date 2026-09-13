import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { FakeAdminPuzzleApiClient } from '../../../../testing/fake-puzzle-api.client';
import { FakePlatformService } from '../../../../testing/fake-platform.service';
import { LocaleService } from '../../../core/i18n/locale.service';
import { BundledTranslateLoader } from '../../../core/i18n/translations';
import { PlatformService } from '../../../core/platform/platform.service';
import { AdminPuzzleApiClient } from '../../../core/puzzle/admin-puzzle-api.client';
import type { AdminPuzzle, Page } from '../../../core/puzzle/puzzle-models';
import { PuzzleListPage } from './puzzle-list.page';

function puzzle(overrides: Partial<AdminPuzzle> = {}): AdminPuzzle {
  return {
    id: 'puzzle-1',
    status: 'PUBLISHED',
    puzzleDate: '2026-09-13',
    title: 'Off by one',
    promptMarkdown: null,
    language: 'java',
    code: 'int i = 0;',
    lineCount: 1,
    buggyLine: 1,
    explanationMarkdown: 'Explained.',
    createdBy: 'user-1',
    publishedAt: '2026-09-13T00:00:00.000Z',
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-12T09:00:00.000Z',
    version: 5,
    ...overrides,
  };
}

function page(items: readonly AdminPuzzle[], overrides: Partial<Page<AdminPuzzle>> = {}) {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1, ...overrides };
}

describe('PuzzleListPage', () => {
  let api: FakeAdminPuzzleApiClient;

  beforeEach(async () => {
    api = new FakeAdminPuzzleApiClient();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminPuzzleApiClient, useValue: api },
        { provide: PlatformService, useValue: new FakePlatformService() },
        provideTranslateService({ loader: BundledTranslateLoader, fallbackLang: 'en', lang: 'en' }),
      ],
    });
    await TestBed.inject(LocaleService).initialize('en');
  });

  async function render() {
    api.listPuzzlesCalls.mockResolvedValue(page([puzzle()]));
    const fixture = TestBed.createComponent(PuzzleListPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function element(fixture: { nativeElement: unknown }): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('asks for the newest running day first and shows the row', async () => {
    const fixture = await render();

    expect(api.listPuzzlesCalls.lastArgs).toEqual([
      { status: undefined, q: undefined, sort: ['puzzle_date,desc'], page: 0, size: 20 },
    ]);
    const text = element(fixture).textContent ?? '';
    expect(text).toContain('Off by one');
    expect(text).toContain('2026-09-13');
    expect(text).toContain('Published');
  });

  it('puts a chosen status in the URL and returns to the first page', async () => {
    const fixture = await render();
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const select = element(fixture).querySelector('#puzzles-filter-status') as HTMLSelectElement;
    select.value = 'DRAFT';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    // The filter lives in the query string rather than in component state
    // alone, so the back button returns to the filtered view somebody left.
    // Page 0 comes back with it: page 4 of an unfiltered list is rarely a
    // page of the filtered one.
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { status: 'DRAFT', page: null },
        queryParamsHandling: 'merge',
      }),
    );
  });

  it('says the filters matched nothing rather than showing an empty table', async () => {
    api.listPuzzlesCalls.mockResolvedValue(page([]));
    const fixture = TestBed.createComponent(PuzzleListPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element(fixture).textContent).toContain('No puzzles match these filters.');
    expect(element(fixture).querySelector('table')).toBeNull();
  });
});

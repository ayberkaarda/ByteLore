import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { FakePlatformService } from '../../../testing/fake-platform.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { BundledTranslateLoader } from '../../core/i18n/translations';
import { PlatformError } from '../../core/platform/errors';
import type { DeltaSummary, TrackSummary } from '../../core/platform/models';
import { PlatformService } from '../../core/platform/platform.service';
import { TrackListPage } from './track-list.page';

function track(overrides: Partial<TrackSummary> = {}): TrackSummary {
  return {
    id: 'track-1',
    slug: 'signals',
    title: 'Signals',
    description: null,
    icon: null,
    contentVersion: 1,
    lessonCount: 3,
    lessonIds: ['lesson-1', 'lesson-2', 'lesson-3'],
    downloadedLessonCount: 0,
    updateAvailableCount: 0,
    availability: 'NOT_DOWNLOADED',
    translation: { locale: 'en', requestedLocale: 'en', isFallback: false },
    ...overrides,
  };
}

function summary(): DeltaSummary {
  return {
    checkedTracks: 1,
    updatedEntities: 0,
    withdrawnEntities: 0,
    newEntitiesAvailable: 0,
    anomalies: [],
  };
}

describe('TrackListPage', () => {
  let fake: FakePlatformService;

  beforeEach(async () => {
    fake = new FakePlatformService();
    fake.capabilities = { canDownload: true, hasLocalStore: true };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PlatformService, useValue: fake },
        provideTranslateService({
          loader: BundledTranslateLoader,
          fallbackLang: 'en',
          lang: 'en',
        }),
      ],
    });
    await TestBed.inject(LocaleService).initialize('en');
  });

  async function render() {
    const fixture = TestBed.createComponent(TrackListPage);
    fixture.detectChanges();
    await fixture.whenStable();
    // `whenStable` can resolve one microtask short of the tail of a promise
    // chain this deep (platform read -> discovery -> store -> platform read
    // again): a macrotask boundary reliably lets it drain the rest.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    return fixture;
  }

  it('refreshes the library exactly once for an empty local list and renders the re-read result', async () => {
    let refreshCalls = 0;
    fake.refreshLibrary = async () => {
      refreshCalls += 1;
      fake.tracks = [track()];
      return summary();
    };

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    expect(refreshCalls).toBe(1);
    expect(element.querySelectorAll('li').length).toBe(1);
    expect(element.querySelector('[data-testid="discovery-note"]')).toBeNull();
  });

  it('does not refresh a second time when the re-read is still empty', async () => {
    let refreshCalls = 0;
    fake.refreshLibrary = async () => {
      refreshCalls += 1;
      return summary();
    };

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    expect(refreshCalls).toBe(1);
    expect(element.textContent).toContain('There are no learning paths to show yet.');
  });

  it('keeps rendering the empty local view, with a note, when the refresh rejects', async () => {
    fake.refreshLibrary = async () => {
      throw new PlatformError('NETWORK_UNAVAILABLE', 'offline');
    };

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.textContent).toContain('There are no learning paths to show yet.');
    expect(element.querySelector('[data-testid="discovery-note"]')?.textContent).toContain(
      'The server could not be reached. Check your connection and try again.',
    );
  });

  it('never calls refresh on a build that cannot download', async () => {
    fake.capabilities = { canDownload: false, hasLocalStore: false };
    let called = false;
    fake.refreshLibrary = async () => {
      called = true;
      return summary();
    };

    await render();

    expect(called).toBe(false);
  });

  it('renders the empty state as boxless centered text, not a bordered box', async () => {
    fake.refreshLibrary = async () => summary();

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    const paragraphs = Array.from(element.querySelectorAll('p'));
    const empty = paragraphs.find((p) =>
      p.textContent?.includes('There are no learning paths to show yet.'),
    );
    expect(empty).toBeTruthy();
    expect(empty?.parentElement?.className).toContain('mt-10');
    expect(empty?.parentElement?.className).toContain('text-center');
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.querySelector('.border')).toBeNull();
  });

  it('places every card meta row via the same flex/mt-auto mechanism, with or without a description', async () => {
    fake.tracks = [
      track({
        id: 'track-1',
        slug: 'with-description',
        title: 'With description',
        description: 'Has one',
      }),
      track({
        id: 'track-2',
        slug: 'without-description',
        title: 'Without description',
        description: null,
      }),
    ];

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const cards = Array.from(element.querySelectorAll('li'));

    expect(cards.length).toBe(2);
    for (const card of cards) {
      expect(card.className).toContain('flex');
      expect(card.className).toContain('flex-col');
      const meta = card.querySelector('[data-testid="track-meta"]');
      expect(meta?.className).toContain('mt-auto');
    }
  });

  it("shows how many of a card's lessons are completed, from the intersection of lessonIds and progress", async () => {
    fake.tracks = [track({ id: 'track-1', slug: 'signals' })];
    fake.listProgress = async () => [
      {
        lessonId: 'lesson-1',
        completedAt: '2026-01-01T00:00:00Z',
        clientUpdatedAt: '2026-01-01T00:00:00Z',
      },
      {
        lessonId: 'lesson-99',
        completedAt: '2026-01-01T00:00:00Z',
        clientUpdatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const completed = element.querySelector('[data-testid="track-completed-count"]');

    expect(completed?.textContent).toContain('1 of 3 completed');
  });

  it('renders every card as not-yet-started, with no error, when listProgress is rejected (offline/no session)', async () => {
    fake.tracks = [track({ id: 'track-1', slug: 'signals' })];
    fake.listProgress = async () => {
      throw new PlatformError('UNAUTHENTICATED', 'no session');
    };

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[role="alert"]')).toBeNull();
    const completed = element.querySelector('[data-testid="track-completed-count"]');
    expect(completed?.textContent).toContain('0 of 3 completed');
  });
});

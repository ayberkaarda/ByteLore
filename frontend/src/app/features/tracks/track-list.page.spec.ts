import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { FakePlatformService } from '../../../testing/fake-platform.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { BundledTranslateLoader } from '../../core/i18n/translations';
import { PlatformError } from '../../core/platform/errors';
import type { DeltaSummary, QueueEntry, TrackSummary } from '../../core/platform/models';
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

function queueEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    entityId: 'lesson-1',
    entityType: 'LESSON',
    title: 'Lesson one',
    batchId: 'batch-1',
    state: 'DONE',
    receivedBytes: 1024,
    totalBytes: 1024,
    attempt: 1,
    pauseReason: null,
    errorCode: null,
    locales: ['en'],
    trackId: 'track-1',
    trackTitle: 'Signals',
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

  it('counts finished lessons across the whole library, and a lesson shared by two paths only once', async () => {
    fake.tracks = [
      track({ id: 'track-1', slug: 'one', lessonCount: 3, lessonIds: ['a', 'b', 'c'] }),
      // `b` is in both paths: two cards, one lesson somebody read once.
      track({ id: 'track-2', slug: 'two', lessonCount: 2, lessonIds: ['b', 'd'] }),
    ];
    fake.listProgress = async () =>
      ['a', 'b'].map((lessonId) => ({
        lessonId,
        completedAt: '2026-01-01T00:00:00Z',
        clientUpdatedAt: '2026-01-01T00:00:00Z',
      }));

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[data-testid="stat-lessons-completed"]')?.textContent).toContain(
      '2 / 5',
    );
  });

  it('counts a path as completed only when every one of its lessons is, and never an empty one', async () => {
    fake.tracks = [
      track({ id: 'track-1', slug: 'done', lessonCount: 2, lessonIds: ['a', 'b'] }),
      track({ id: 'track-2', slug: 'partly', lessonCount: 2, lessonIds: ['c', 'd'] }),
      track({ id: 'track-3', slug: 'empty', lessonCount: 0, lessonIds: [] }),
    ];
    fake.listProgress = async () =>
      ['a', 'b', 'c'].map((lessonId) => ({
        lessonId,
        completedAt: '2026-01-01T00:00:00Z',
        clientUpdatedAt: '2026-01-01T00:00:00Z',
      }));

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[data-testid="stat-paths-completed"]')?.textContent).toContain(
      '1 / 3',
    );
  });

  it('sums the stored lessons and the bytes the queue reports as held', async () => {
    fake.tracks = [
      track({ id: 'track-1', slug: 'one', lessonCount: 3, downloadedLessonCount: 2 }),
      track({
        id: 'track-2',
        slug: 'two',
        lessonCount: 2,
        lessonIds: ['x', 'y'],
        downloadedLessonCount: 1,
      }),
    ];
    fake.queueState = async () => [
      queueEntry({ entityId: 'one', totalBytes: 1_048_576 }),
      queueEntry({ entityId: 'two', totalBytes: 1_048_576 }),
      // Not finished: it is queued, not held, so it adds no bytes.
      queueEntry({ entityId: 'three', state: 'QUEUED', totalBytes: 4_194_304 }),
    ];

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[data-testid="stat-downloaded"]')?.textContent).toContain(
      '3 / 5',
    );
    expect(element.querySelector('[data-testid="stat-storage"]')?.textContent).toContain('2.0 MB');
    // The whole sentence is what assistive technology gets, since the figure
    // and its label are ambiguous read out separately.
    expect(element.querySelector('[data-testid="stat-storage"] .sr-only')?.textContent).toContain(
      '2.0 MB used on this device',
    );
  });

  it('reports the pending updates and the unfinished queue rows in the status panel', async () => {
    fake.tracks = [
      track({ id: 'track-1', slug: 'one', updateAvailableCount: 2 }),
      track({ id: 'track-2', slug: 'two', lessonIds: ['x'], lessonCount: 1 }),
    ];
    fake.queueState = async () => [
      queueEntry({ entityId: 'one' }),
      queueEntry({ entityId: 'two', state: 'FAILED' }),
      queueEntry({ entityId: 'three', state: 'PAUSED' }),
    ];

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[data-testid="library-status-updates"]')?.textContent).toContain(
      '2',
    );
    expect(element.querySelector('[data-testid="library-status-queue"]')?.textContent).toContain(
      '2 downloads still in the queue',
    );
    expect(element.querySelector('[data-testid="library-status-link"]')?.getAttribute('href')).toBe(
      '/downloads',
    );
  });

  it('marks a card whose stored copy is out of date, and leaves the rest unmarked', async () => {
    fake.tracks = [
      track({ id: 'track-1', slug: 'stale', updateAvailableCount: 1 }),
      track({ id: 'track-2', slug: 'current', lessonIds: ['x'], lessonCount: 1 }),
    ];

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const marks = element.querySelectorAll('[data-testid="track-update-available"]');

    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toContain('Update available');
    expect(marks[0].className).toContain('bg-warning-soft');
  });

  it('points the resume tile at the path holding the most recently touched lesson', async () => {
    fake.tracks = [
      track({ id: 'track-1', slug: 'older', lessonCount: 2, lessonIds: ['a', 'b'] }),
      track({ id: 'track-2', slug: 'newer', lessonCount: 2, lessonIds: ['c', 'd'] }),
    ];
    fake.listProgress = async () => [
      {
        lessonId: 'a',
        completedAt: '2026-01-01T00:00:00Z',
        clientUpdatedAt: '2026-01-01T00:00:00Z',
      },
      {
        lessonId: 'c',
        completedAt: '2026-03-02T00:00:00Z',
        clientUpdatedAt: '2026-03-02T00:00:00Z',
      },
      {
        lessonId: 'b',
        completedAt: '2026-02-01T00:00:00Z',
        clientUpdatedAt: '2026-02-01T00:00:00Z',
      },
    ];

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const tile = element.querySelector('[data-testid="continue-tile"]');

    expect(tile?.getAttribute('href')).toBe('/tracks/newer');
    expect(tile?.textContent).toContain('Continue where you left off');
    expect(tile?.textContent).toContain('1 of 2 completed');
  });

  it('renders no resume tile when there is no progress at all', async () => {
    fake.tracks = [track({ id: 'track-1', slug: 'signals' })];

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[data-testid="continue-tile"]')).toBeNull();
  });

  it('renders no resume tile when no progress row belongs to a path in the library', async () => {
    fake.tracks = [track({ id: 'track-1', slug: 'signals', lessonIds: ['a', 'b', 'c'] })];
    fake.listProgress = async () => [
      {
        lessonId: 'withdrawn-lesson',
        completedAt: '2026-01-01T00:00:00Z',
        clientUpdatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[data-testid="continue-tile"]')).toBeNull();
  });

  it('drops the status panel and both download tiles on a build that cannot download', async () => {
    fake.capabilities = { canDownload: false, hasLocalStore: false };
    fake.refreshLibrary = async () => summary();
    fake.tracks = [track({ id: 'track-1', slug: 'signals', updateAvailableCount: 3 })];

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[data-testid="library-status"]')).toBeNull();
    expect(element.querySelector('[data-testid="stat-downloaded"]')).toBeNull();
    expect(element.querySelector('[data-testid="stat-storage"]')).toBeNull();
    expect(element.querySelector('[data-testid="track-update-available"]')).toBeNull();
    // The two tiles that mean something without a local store stay.
    expect(element.querySelector('[data-testid="stat-lessons-completed"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="stat-paths-completed"]')).not.toBeNull();
  });

  it('gives every card a monogram cut from its own title, hidden from assistive technology', async () => {
    fake.tracks = [
      track({ id: 'track-1', slug: 'signals', title: 'signals' }),
      track({ id: 'track-2', slug: 'rust', title: 'Rust', lessonIds: ['x'], lessonCount: 1 }),
    ];

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const monograms = Array.from(element.querySelectorAll('[data-testid="track-monogram"]'));

    expect(monograms.map((m) => m.textContent?.trim())).toEqual(['S', 'R']);
    for (const monogram of monograms) {
      expect(monogram.getAttribute('aria-hidden')).toBe('true');
      expect(monogram.className).toContain('h-10');
      expect(monogram.className).toContain('w-10');
      expect(monogram.className).toContain('bg-accent-soft');
    }
  });

  it('shows a completion bar beside the count on every card that has lessons', async () => {
    fake.tracks = [
      track({ id: 'track-1', slug: 'signals' }),
      track({ id: 'track-2', slug: 'empty', lessonCount: 0, lessonIds: [] }),
    ];
    fake.listProgress = async () => [
      {
        lessonId: 'lesson-1',
        completedAt: '2026-01-01T00:00:00Z',
        clientUpdatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const bars = element.querySelectorAll('li [data-testid="progress-bar"]');

    expect(bars.length).toBe(1);
    expect(bars[0].getAttribute('aria-valuenow')).toBe('33');
  });

  // jsdom has no viewport to resize, so the responsive behaviour is asserted
  // where it is actually declared: the classes. The board is three columns
  // only from `lg`/`xl` up, the panels stick only there, and the stacking
  // order below that is stated explicitly rather than left to markup order.
  it('opens the board only at wide widths and stacks summary, list and status in that order below', async () => {
    fake.tracks = [track({ id: 'track-1', slug: 'signals' })];

    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    const root = element.querySelector('.max-w-7xl');
    expect(root?.className).toContain('mx-auto');

    const board = element.querySelector('[data-testid="library-summary"]')?.parentElement;
    expect(board?.className).toContain('grid');
    expect(board?.className).toContain('lg:grid-cols-[16rem_minmax(0,1fr)]');
    expect(board?.className).toContain('xl:grid-cols-[16rem_minmax(0,1fr)_20rem]');

    const summaryPanel = element.querySelector('[data-testid="library-summary"]');
    expect(summaryPanel?.className).toContain('order-1');
    expect(summaryPanel?.className).toContain('lg:sticky');
    expect(summaryPanel?.className).toContain('self-start');
    expect(summaryPanel?.className).not.toContain('hidden');

    expect(element.querySelector('[data-testid="track-list"]')?.className).toContain('order-2');
    // Single column: the two-up grid the cards used before the board existed
    // would squeeze the middle column of a three-column layout.
    expect(element.querySelector('[data-testid="track-list"]')?.className).not.toContain(
      'sm:grid-cols-2',
    );

    const status = element.querySelector('[data-testid="library-status"]');
    expect(status?.className).toContain('order-3');
    expect(status?.className).toContain('xl:sticky');
    expect(status?.className).not.toContain('hidden');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { FakeAuthSession } from '../../../testing/fake-auth-session';
import { FakePlatformService } from '../../../testing/fake-platform.service';
import { FakePuzzleApiClient } from '../../../testing/fake-puzzle-api.client';
import { AuthSession } from '../../core/auth/auth-session';
import { LocaleService } from '../../core/i18n/locale.service';
import { BundledTranslateLoader } from '../../core/i18n/translations';
import { PlatformError } from '../../core/platform/errors';
import { PlatformService } from '../../core/platform/platform.service';
import { PuzzleApiClient } from '../../core/puzzle/puzzle-api.client';
import type { LeaderboardEntry, Page } from '../../core/puzzle/puzzle-models';
import { PuzzleLeaderboard } from './puzzle-leaderboard';

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    userId: 'user-other',
    displayName: 'Mira',
    elapsedMillis: 31_500,
    submittedAt: '2026-09-13T07:41:00.000Z',
    currentStreak: 4,
    ...overrides,
  };
}

function board(items: readonly LeaderboardEntry[]): Page<LeaderboardEntry> {
  return { items, page: 0, size: 10, totalElements: items.length, totalPages: 1 };
}

describe('PuzzleLeaderboard', () => {
  let api: FakePuzzleApiClient;
  let session: FakeAuthSession;

  beforeEach(async () => {
    api = new FakePuzzleApiClient();
    session = new FakeAuthSession();
    session.setRole('USER');

    TestBed.configureTestingModule({
      providers: [
        { provide: PuzzleApiClient, useValue: api },
        { provide: AuthSession, useValue: session },
        { provide: PlatformService, useValue: new FakePlatformService() },
        provideTranslateService({ loader: BundledTranslateLoader, fallbackLang: 'en', lang: 'en' }),
      ],
    });
    await TestBed.inject(LocaleService).initialize('en');
  });

  async function render() {
    const fixture = TestBed.createComponent(PuzzleLeaderboard);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function element(fixture: { nativeElement: unknown }): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('reads the fastest board first and formats each time as a stopwatch reading', async () => {
    api.getLeaderboardCalls.mockResolvedValue(board([entry()]));
    const fixture = await render();

    expect(api.getLeaderboardCalls.lastArgs).toEqual([{ sort: 'time', page: 0, size: 10 }]);
    const text = element(fixture).textContent ?? '';
    expect(text).toContain('Mira');
    expect(text).toContain('0:31.5');
  });

  it('re-reads in the other order when the board is sorted by streak', async () => {
    api.getLeaderboardCalls.mockResolvedValue(board([entry()]));
    const fixture = await render();

    (
      element(fixture).querySelector('[data-testid="board-sort-streak"]') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.getLeaderboardCalls.lastArgs).toEqual([{ sort: 'streak', page: 0, size: 10 }]);
    const pressed = element(fixture).querySelector('[data-testid="board-sort-streak"]');
    expect(pressed?.getAttribute('aria-pressed')).toBe('true');
  });

  it('marks the viewer’s own row, which is the row they came to find', async () => {
    api.getLeaderboardCalls.mockResolvedValue(
      board([entry(), entry({ userId: 'user-user', displayName: 'user', elapsedMillis: 64_200 })]),
    );
    const fixture = await render();

    const rows = Array.from(
      element(fixture).querySelectorAll<HTMLElement>('[data-testid="board-row"]'),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].classList).not.toContain('bg-accent-soft');
    expect(rows[1].classList).toContain('bg-accent-soft');
    expect(rows[1].textContent).toContain('you');
    // A minute and four seconds, not 64200.
    expect(rows[1].textContent).toContain('1:04.2');
  });

  it('says nobody has solved it rather than showing an empty table', async () => {
    api.getLeaderboardCalls.mockResolvedValue(board([]));
    const fixture = await render();

    expect(element(fixture).textContent).toContain('Nobody has solved it yet today.');
    expect(element(fixture).querySelector('table')).toBeNull();
  });

  it('offers a way back when the board could not be read', async () => {
    api.getLeaderboardCalls.mockRejectedValue(new PlatformError('NETWORK_UNAVAILABLE', 'offline'));
    const fixture = await render();

    const alert = element(fixture).querySelector('[role="alert"]');
    expect(alert).not.toBeNull();

    api.getLeaderboardCalls.mockResolvedValue(board([entry()]));
    (alert?.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element(fixture).textContent).toContain('Mira');
  });

  it('re-reads when the surrounding screen says an answer has landed', async () => {
    api.getLeaderboardCalls.mockResolvedValue(board([entry()]));
    const fixture = TestBed.createComponent(PuzzleLeaderboard);
    fixture.componentRef.setInput('refreshToken', 0);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.getLeaderboardCalls.calls).toHaveLength(1);

    fixture.componentRef.setInput('refreshToken', 1);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Waiting out the poll interval to see your own name is a long twelve
    // seconds, so the bump is what makes the board current immediately.
    expect(api.getLeaderboardCalls.calls).toHaveLength(2);
  });
});

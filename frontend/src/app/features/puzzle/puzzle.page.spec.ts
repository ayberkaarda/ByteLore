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
import type {
  DailyPuzzle,
  LeaderboardEntry,
  Page,
  PuzzleAttemptResult,
} from '../../core/puzzle/puzzle-models';
import { PuzzlePage } from './puzzle.page';

function puzzle(overrides: Partial<DailyPuzzle> = {}): DailyPuzzle {
  return {
    id: 'puzzle-1',
    puzzleDate: '2026-09-13',
    title: 'Off by one',
    promptMarkdown: 'This loop never terminates.',
    language: 'java',
    code: 'int i = 0;\nwhile (i < 10) {\n  System.out.println(i);\n}',
    lineCount: 4,
    attempted: false,
    buggyLine: null,
    explanationMarkdown: null,
    attempt: null,
    ...overrides,
  };
}

function attemptResult(overrides: Partial<PuzzleAttemptResult> = {}): PuzzleAttemptResult {
  return {
    puzzleId: 'puzzle-1',
    selectedLine: 4,
    correct: false,
    buggyLine: 3,
    explanationMarkdown: '`i` is never incremented.',
    elapsedMillis: 42_000,
    submittedAt: '2026-09-13T09:12:00.000Z',
    currentStreak: 0,
    longestStreak: 7,
    ...overrides,
  };
}

function emptyBoard(): Page<LeaderboardEntry> {
  return { items: [], page: 0, size: 10, totalElements: 0, totalPages: 0 };
}

describe('PuzzlePage', () => {
  let api: FakePuzzleApiClient;
  let session: FakeAuthSession;

  beforeEach(async () => {
    api = new FakePuzzleApiClient();
    session = new FakeAuthSession();
    session.setRole('USER');
    api.getLeaderboardCalls.mockResolvedValue(emptyBoard());

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

  /**
   * Settles the screen more than once on purpose. The reads cascade: the
   * puzzle arrives, which is what puts the listing and the prompt on the
   * page, and each of those then does asynchronous work of its own
   * (highlighting, markdown). One round would photograph the gutter before
   * the code is in it.
   */
  async function settle(fixture: {
    detectChanges: () => void;
    whenStable: () => Promise<unknown>;
  }) {
    for (let round = 0; round < 3; round += 1) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  async function render() {
    const fixture = TestBed.createComponent(PuzzlePage);
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  }

  function element(fixture: { nativeElement: unknown }): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function lineInputs(fixture: { nativeElement: unknown }): HTMLInputElement[] {
    return Array.from(
      element(fixture).querySelectorAll<HTMLInputElement>('.puzzle-code-line input'),
    );
  }

  it('shows the listing with no answer in it before an attempt', async () => {
    api.getTodayCalls.mockResolvedValue(puzzle());
    const fixture = await render();

    const text = element(fixture).textContent ?? '';
    expect(text).toContain('Off by one');
    expect(text).toContain('This loop never terminates.');
    expect(lineInputs(fixture)).toHaveLength(4);
    // The answer is not on screen, and it was never in the payload either.
    expect(element(fixture).querySelector('.is-correct')).toBeNull();
    expect(element(fixture).querySelector('[data-testid="puzzle-outcome"]')).toBeNull();
  });

  it('refuses to send an answer until a line has been picked', async () => {
    api.getTodayCalls.mockResolvedValue(puzzle());
    const fixture = await render();

    const submit = element(fixture).querySelector(
      '[data-testid="puzzle-submit"]',
    ) as HTMLButtonElement;
    // Unavailable rather than inert, so it keeps the focus a keyboard reader
    // may already have put on it -- which is why the handler has to refuse
    // the press itself.
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    submit.click();
    await settle(fixture);

    expect(api.submitAttemptCalls.calls).toHaveLength(0);
  });

  it('sends the picked line with a duration measured on this device', async () => {
    api.getTodayCalls.mockResolvedValue(puzzle());
    api.submitAttemptCalls.mockResolvedValue(attemptResult());
    const started = 1_760_000_000_000;
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(started)
      .mockReturnValue(started + 42_000);

    const fixture = await render();
    lineInputs(fixture)[3].click();
    await settle(fixture);

    (element(fixture).querySelector('[data-testid="puzzle-submit"]') as HTMLButtonElement).click();
    await settle(fixture);

    expect(api.submitAttemptCalls.lastArgs).toEqual([{ selectedLine: 4, elapsedMillis: 42_000 }]);
    nowSpy.mockRestore();
  });

  it('marks both the answer and the miss after a wrong guess, and explains it', async () => {
    api.getTodayCalls.mockResolvedValue(puzzle());
    api.submitAttemptCalls.mockResolvedValue(attemptResult());
    const fixture = await render();

    lineInputs(fixture)[3].click();
    await settle(fixture);
    (element(fixture).querySelector('[data-testid="puzzle-submit"]') as HTMLButtonElement).click();
    await settle(fixture);

    const rows = Array.from(element(fixture).querySelectorAll('.puzzle-code-line'));
    expect(rows[2].classList).toContain('is-correct');
    expect(rows[3].classList).toContain('is-wrong');

    const outcome = element(fixture).querySelector('[data-testid="puzzle-outcome"]') as HTMLElement;
    expect(outcome.textContent).toContain('Not this time');
    expect(
      outcome.querySelector('[data-testid="puzzle-current-streak"]')?.textContent?.trim(),
    ).toBe('0');
    // The picker is gone: there is no second attempt to offer.
    expect(element(fixture).querySelector('[data-testid="puzzle-submit"]')).toBeNull();
  });

  it('goes straight to the finished view for a day already played', async () => {
    api.getTodayCalls.mockResolvedValue(
      puzzle({
        attempted: true,
        buggyLine: 3,
        explanationMarkdown: '`i` is never incremented.',
        attempt: {
          selectedLine: 3,
          correct: true,
          elapsedMillis: 18_400,
          submittedAt: '2026-09-13T08:00:00.000Z',
        },
      }),
    );
    const fixture = await render();

    const outcome = element(fixture).querySelector('[data-testid="puzzle-outcome"]') as HTMLElement;
    expect(outcome.textContent).toContain('Correct');
    expect(element(fixture).querySelector('[data-testid="puzzle-submit"]')).toBeNull();
    expect(lineInputs(fixture).every((input) => input.disabled)).toBe(true);
    // No clock either: nothing is being timed on a day that is over.
    expect(element(fixture).querySelector('[data-testid="puzzle-clock"]')).toBeNull();
  });

  it('reads the puzzle again rather than reporting an attempt the server says is spent', async () => {
    api.getTodayCalls.mockResolvedValueOnce(puzzle());
    api.submitAttemptCalls.mockRejectedValue(
      new PlatformError('PUZZLE_ALREADY_ATTEMPTED', 'already answered'),
    );
    api.getTodayCalls.mockResolvedValueOnce(
      puzzle({
        attempted: true,
        buggyLine: 3,
        explanationMarkdown: 'Explained.',
        attempt: {
          selectedLine: 1,
          correct: false,
          elapsedMillis: 5_000,
          submittedAt: '2026-09-13T08:00:00.000Z',
        },
      }),
    );
    const fixture = await render();

    lineInputs(fixture)[3].click();
    await settle(fixture);
    (element(fixture).querySelector('[data-testid="puzzle-submit"]') as HTMLButtonElement).click();
    await settle(fixture);

    expect(api.getTodayCalls.calls).toHaveLength(2);
    expect(element(fixture).querySelector('[data-testid="puzzle-outcome"]')).not.toBeNull();
  });

  it('treats a day with no puzzle as an ordinary state rather than a failure', async () => {
    api.getTodayCalls.mockRejectedValue(new PlatformError('PUZZLE_NOT_FOUND', 'none'));
    const fixture = await render();

    const text = element(fixture).textContent ?? '';
    expect(text).toContain('No puzzle today.');
    expect(element(fixture).querySelector('[role="alert"]')).toBeNull();
  });

  it('reports a failure that is not "no puzzle today" as an error with a way back', async () => {
    api.getTodayCalls.mockRejectedValue(new PlatformError('NETWORK_UNAVAILABLE', 'offline'));
    const fixture = await render();

    expect(element(fixture).querySelector('[role="alert"]')).not.toBeNull();
    expect(element(fixture).textContent).not.toContain('No puzzle today.');
  });
});

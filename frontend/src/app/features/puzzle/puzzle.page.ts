import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { interval } from 'rxjs';

import { errorKey } from '../../core/platform/error-key';
import { PlatformError } from '../../core/platform/errors';
import { PuzzleApiClient } from '../../core/puzzle/puzzle-api.client';
import type { DailyPuzzle, PuzzleAttemptResult } from '../../core/puzzle/puzzle-models';
import { ElapsedPipe } from '../../shared/elapsed.pipe';
import { MarkdownView } from '../../shared/markdown-view';
import { PuzzleCode } from './puzzle-code';
import { PuzzleLeaderboard } from './puzzle-leaderboard';

/** How often the running clock redraws. A second is the finest unit worth watching tick. */
const CLOCK_INTERVAL_MS = 1000;

/**
 * The daily bug hunt: one listing, one click, one answer.
 *
 * This is a reading screen, not a dashboard — a single column at reading
 * width, with the scoreboard underneath rather than beside, because the
 * listing is the whole task and a panel next to it competes for exactly the
 * attention the task needs.
 *
 * Unlike everything else here it needs a session and a connection, and says
 * so rather than pretending otherwise. A shared daily puzzle with a
 * scoreboard and a streak is a claim about when something happened relative
 * to other people, and no device can settle that from a local replica.
 *
 * Timing is measured on this device, from the moment an unanswered puzzle
 * reaches the screen to the moment the answer is sent. The server takes that
 * number on trust and uses it to order a scoreboard and for nothing else,
 * which is the only honest place to measure it from: a duration measured
 * server-side would be the round trip plus however long a tab sat unopened.
 *
 * A puzzle that arrives already answered — a reopened tab, a second device —
 * goes straight to the finished view. There is no second attempt to offer,
 * and offering one would be an invitation the server is going to refuse.
 */
@Component({
  selector: 'app-puzzle-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ElapsedPipe, MarkdownView, PuzzleCode, PuzzleLeaderboard],
  templateUrl: './puzzle.page.html',
})
export class PuzzlePage {
  private readonly api = inject(PuzzleApiClient);

  protected readonly puzzle = signal<DailyPuzzle | null>(null);
  protected readonly loading = signal(true);
  protected readonly failureKey = signal<string | null>(null);

  /**
   * Set when there simply is no puzzle today, which is an ordinary state and
   * not a failure: a day nobody published one is a quiet day, not a broken
   * screen, and the generic error card would say the opposite.
   */
  protected readonly noPuzzleToday = signal(false);

  /** The line under the pointer, before it is sent. Null until one is picked. */
  protected readonly pick = signal<number | null>(null);

  protected readonly result = signal<PuzzleAttemptResult | null>(null);
  protected readonly submitting = signal(false);
  protected readonly submitFailureKey = signal<string | null>(null);

  /** Bumped when an answer lands, so the board does not wait out its poll. */
  protected readonly boardToken = signal(0);

  /** Milliseconds on the running clock, redrawn once a second while unanswered. */
  protected readonly clock = signal(0);

  private startedAtMillis: number | null = null;

  private readonly outcomePanel = viewChild<ElementRef<HTMLElement>>('outcomePanel');

  /** True once this player's attempt is spent, whenever it was spent. */
  protected readonly revealed = computed(
    () => this.result() !== null || (this.puzzle()?.attempted ?? false),
  );

  protected readonly buggyLine = computed<number | null>(
    () => this.result()?.buggyLine ?? this.puzzle()?.buggyLine ?? null,
  );

  protected readonly explanationMarkdown = computed<string | null>(
    () => this.result()?.explanationMarkdown ?? this.puzzle()?.explanationMarkdown ?? null,
  );

  /**
   * The line this screen is showing as chosen: the answered one once there is
   * an answer, the pending pick before that. The two are never both live —
   * the picker is gone by the time an attempt exists — but the answered value
   * wins anyway, because it is the one the server recorded.
   */
  protected readonly selectedLine = computed<number | null>(
    () => this.result()?.selectedLine ?? this.puzzle()?.attempt?.selectedLine ?? this.pick(),
  );

  protected readonly correct = computed<boolean | null>(
    () => this.result()?.correct ?? this.puzzle()?.attempt?.correct ?? null,
  );

  protected readonly elapsedMillis = computed<number | null>(
    () => this.result()?.elapsedMillis ?? this.puzzle()?.attempt?.elapsedMillis ?? null,
  );

  constructor() {
    void this.load();

    interval(CLOCK_INTERVAL_MS)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.startedAtMillis !== null) {
          this.clock.set(Date.now() - this.startedAtMillis);
        }
      });

    // The verdict replaces the button that was pressed to get it. Without
    // this the focus would land on the document body and a keyboard reader
    // would have to tab back in from the top of the page to find out whether
    // they were right.
    //
    // Only for an answer given here and now. A day already played arrives
    // with the same panel on the first paint, and moving the focus into it
    // then would take a reader past the heading of a page they have not
    // started reading.
    effect(() => {
      const panel = this.outcomePanel();
      if (panel && this.result() !== null) {
        panel.nativeElement.focus();
      }
    });
  }

  protected onLineSelect(line: number): void {
    this.pick.set(line);
    this.submitFailureKey.set(null);
  }

  protected retry(): void {
    void this.load();
  }

  protected async submit(): Promise<void> {
    const line = this.pick();
    // The button is marked unavailable rather than disabled while the answer
    // is in flight, so that it keeps the focus it is holding. That leaves
    // refusing a second press to this method, which is also where the "no
    // line picked yet" case is refused.
    if (line === null || this.submitting() || this.revealed()) {
      return;
    }
    this.submitting.set(true);
    this.submitFailureKey.set(null);
    const elapsed = this.startedAtMillis === null ? 0 : Date.now() - this.startedAtMillis;
    try {
      this.result.set(await this.api.submitAttempt({ selectedLine: line, elapsedMillis: elapsed }));
      this.startedAtMillis = null;
      this.boardToken.update((token) => token + 1);
    } catch (error) {
      // An attempt the server says is already spent is not a failure to
      // report: this device simply has a stale copy of a day it already
      // played. Re-reading the puzzle brings back the answer and the
      // explanation, which is what the player was owed either way.
      if (error instanceof PlatformError && error.code === 'PUZZLE_ALREADY_ATTEMPTED') {
        this.startedAtMillis = null;
        await this.load();
        return;
      }
      this.submitFailureKey.set(errorKey(error));
    } finally {
      this.submitting.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.failureKey.set(null);
    this.noPuzzleToday.set(false);
    this.result.set(null);
    this.pick.set(null);
    this.startedAtMillis = null;
    this.clock.set(0);
    try {
      const puzzle = await this.api.getToday();
      this.puzzle.set(puzzle);
      if (!puzzle.attempted) {
        // The clock starts when the listing reaches the screen, not when the
        // request left it: the wait for the server is not part of anybody's
        // solve.
        this.startedAtMillis = Date.now();
      }
    } catch (error) {
      this.puzzle.set(null);
      if (error instanceof PlatformError && error.code === 'PUZZLE_NOT_FOUND') {
        this.noPuzzleToday.set(true);
      } else {
        this.failureKey.set(errorKey(error));
      }
    } finally {
      this.loading.set(false);
    }
  }
}

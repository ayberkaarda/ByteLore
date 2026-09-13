import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { interval } from 'rxjs';

import { AuthSession } from '../../core/auth/auth-session';
import { errorKey } from '../../core/platform/error-key';
import { PuzzleApiClient } from '../../core/puzzle/puzzle-api.client';
import type { LeaderboardEntry, LeaderboardSort } from '../../core/puzzle/puzzle-models';
import { ElapsedPipe } from '../../shared/elapsed.pipe';

/** How many players one board shows. A day's board is a glance, not an archive. */
const BOARD_SIZE = 10;

/**
 * How often the board re-reads itself while the screen is open.
 *
 * Long enough that a day of open tabs is not a load pattern, short enough
 * that somebody who just solved it sees their own row arrive without
 * reloading. It is deliberately not a live stream: nothing here is worth a
 * connection held open, and a board that moved under the reader every second
 * would be harder to read, not fresher.
 */
const REFRESH_INTERVAL_MS = 12_000;

/**
 * Today's scoreboard, in either of the two orders the server serves it.
 *
 * Only players who answered correctly appear — that is the server's rule, not
 * this component's, and it is the right one: a board that listed failures
 * would be a reason not to play.
 *
 * The viewer's own row is marked. It is the one row they came to find, and on
 * a board where everyone else is a stranger it is also the only row that
 * tells them anything about themselves.
 */
@Component({
  selector: 'app-puzzle-leaderboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ElapsedPipe],
  templateUrl: './puzzle-leaderboard.html',
})
export class PuzzleLeaderboard {
  private readonly api = inject(PuzzleApiClient);
  private readonly session = inject(AuthSession);

  /**
   * Bumped by the screen around this one when something happened that the
   * board should already know about — an answer that just landed, above all.
   * Waiting out the poll interval to see your own name is a long twelve
   * seconds.
   */
  readonly refreshToken = input(0);

  protected readonly sort = signal<LeaderboardSort>('time');
  protected readonly entries = signal<readonly LeaderboardEntry[]>([]);

  /** True only for a read the reader is waiting on, never for a background poll. */
  protected readonly loading = signal(true);
  protected readonly failureKey = signal<string | null>(null);

  protected readonly ownUserId = this.session.userId;

  /** One read at a time, so a slow response cannot be overtaken by the next tick. */
  private inFlight = false;

  constructor() {
    effect(() => {
      const sort = this.sort();
      // Read so that a bump from the surrounding screen re-runs this effect;
      // the value itself is a token and means nothing on its own.
      this.refreshToken();
      void this.load(sort, true);
    });

    interval(REFRESH_INTERVAL_MS)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        void this.load(this.sort(), false);
      });
  }

  protected onSortChange(sort: LeaderboardSort): void {
    this.sort.set(sort);
  }

  protected retry(): void {
    void this.load(this.sort(), true);
  }

  /**
   * @param awaited whether a reader is watching this particular read. A
   *     background poll neither raises the loading state nor replaces the
   *     board with an error card: the rows already on screen are still the
   *     best answer available, and blanking them because one refresh out of
   *     three hundred failed would be a worse screen than a slightly stale
   *     one.
   */
  private async load(sort: LeaderboardSort, awaited: boolean): Promise<void> {
    if (this.inFlight) {
      return;
    }
    this.inFlight = true;
    if (awaited) {
      this.loading.set(true);
      this.failureKey.set(null);
    }
    try {
      const page = await this.api.getLeaderboard({ sort, page: 0, size: BOARD_SIZE });
      this.entries.set(page.items);
      this.failureKey.set(null);
    } catch (error) {
      if (awaited) {
        this.failureKey.set(errorKey(error));
      }
    } finally {
      this.inFlight = false;
      if (awaited) {
        this.loading.set(false);
      }
    }
  }
}

import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL, toPlatformError } from '../platform/api';
import type { Page } from '../platform/models';
import type { WirePage } from '../platform/rest-wire';
import type {
  DailyPuzzle,
  LeaderboardEntry,
  LeaderboardQuery,
  PuzzleAttemptInput,
  PuzzleAttemptResult,
} from './puzzle-models';
import type {
  WireLeaderboardEntry,
  WirePuzzleAttemptRequest,
  WirePuzzleAttemptResponse,
  WireTodayPuzzle,
} from './puzzle-wire';

/**
 * The player's side of the daily bug hunt, over HTTP on both builds.
 *
 * Outside `PlatformService` on purpose, and for a stronger reason than the
 * admin client's: this feature has no offline behaviour to abstract. A shared
 * daily puzzle, a scoreboard and a streak are all claims about when something
 * happened relative to other people, which a device holding a local replica
 * cannot settle on its own. There is nothing here for a second implementation
 * to provide, so wiring it through the platform abstraction would only give a
 * component a door to ask which build it is running in.
 *
 * Every endpoint needs a signed-in caller and no particular role.
 */
@Injectable({ providedIn: 'root' })
export class PuzzleApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /**
   * Today's puzzle, plus this player's own answer to it if they have already
   * given one.
   *
   * A reopened screen is served the finished state directly, which is why the
   * attempt endpoint below is normally called exactly once per day: the
   * verdict, the answer line and the explanation all ride along here once the
   * attempt exists.
   */
  async getToday(): Promise<DailyPuzzle> {
    try {
      const wire = await firstValueFrom(
        this.http.get<WireTodayPuzzle>(`${this.baseUrl}/puzzle/today`),
      );
      return toDailyPuzzle(wire);
    } catch (error) {
      throw toPlatformError(error);
    }
  }

  async submitAttempt(input: PuzzleAttemptInput): Promise<PuzzleAttemptResult> {
    const body: WirePuzzleAttemptRequest = {
      selected_line: input.selectedLine,
      elapsed_millis: input.elapsedMillis,
    };
    try {
      const wire = await firstValueFrom(
        this.http.post<WirePuzzleAttemptResponse>(`${this.baseUrl}/puzzle/today/attempt`, body),
      );
      return {
        puzzleId: wire.puzzle_id,
        selectedLine: wire.selected_line,
        correct: wire.correct,
        buggyLine: wire.buggy_line,
        explanationMarkdown: wire.explanation_markdown,
        elapsedMillis: wire.elapsed_millis,
        submittedAt: wire.submitted_at,
        currentStreak: wire.current_streak,
        longestStreak: wire.longest_streak,
      };
    } catch (error) {
      throw toPlatformError(error);
    }
  }

  async getLeaderboard(query: LeaderboardQuery): Promise<Page<LeaderboardEntry>> {
    let params = new HttpParams();
    if (query.sort !== undefined) {
      params = params.set('sort', query.sort);
    }
    if (query.page !== undefined) {
      params = params.set('page', query.page);
    }
    if (query.size !== undefined) {
      params = params.set('size', query.size);
    }
    try {
      const wire = await firstValueFrom(
        this.http.get<WirePage<WireLeaderboardEntry>>(`${this.baseUrl}/puzzle/today/leaderboard`, {
          params,
        }),
      );
      return {
        items: wire.items.map((item) => ({
          userId: item.user_id,
          displayName: item.display_name,
          elapsedMillis: item.elapsed_millis,
          submittedAt: item.submitted_at,
          currentStreak: item.current_streak,
        })),
        page: wire.page,
        size: wire.size,
        totalElements: wire.total_elements,
        totalPages: wire.total_pages,
      };
    } catch (error) {
      throw toPlatformError(error);
    }
  }
}

function toDailyPuzzle(wire: WireTodayPuzzle): DailyPuzzle {
  return {
    id: wire.id,
    puzzleDate: wire.puzzle_date,
    title: wire.title,
    promptMarkdown: wire.prompt_markdown,
    language: wire.language,
    code: wire.code,
    lineCount: wire.line_count,
    attempted: wire.attempted,
    buggyLine: wire.buggy_line,
    explanationMarkdown: wire.explanation_markdown,
    attempt:
      wire.attempt === null
        ? null
        : {
            selectedLine: wire.attempt.selected_line,
            correct: wire.attempt.correct,
            elapsedMillis: wire.attempt.elapsed_millis,
            submittedAt: wire.attempt.submitted_at,
          },
  };
}

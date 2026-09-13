/**
 * The daily-puzzle REST payloads exactly as they arrive on and go out over
 * the wire.
 *
 * `snake_case`, matching the records in `dev.bytelore.server.puzzle.dto` and
 * `dev.bytelore.server.puzzle.admin.dto` under the API's global
 * `SNAKE_CASE` property naming — field names below are read off the DTO
 * source rather than guessed from prose. Declared separately from the view
 * models in `puzzle-models.ts` for the same reason `rest-wire.ts` is separate
 * from `models.ts`: the snake_case-to-camelCase mapping is a visible, typed
 * step inside the clients, not an assumption spread across call sites.
 */
import type { PuzzleStatus, PuzzleStep } from './puzzle-models';

// ---- Player ------------------------------------------------------------------

export interface WirePuzzleAttemptSummary {
  readonly selected_line: number;
  readonly correct: boolean;
  readonly elapsed_millis: number;
  readonly submitted_at: string;
}

/**
 * `TodayPuzzleResponse`. The last three fields are null until the caller has
 * answered — they are left out of the server's projection rather than blanked
 * afterwards, so the answer never travels with the question.
 */
export interface WireTodayPuzzle {
  readonly id: string;
  readonly puzzle_date: string;
  readonly title: string;
  readonly prompt_markdown: string | null;
  readonly language: string;
  readonly code: string;
  readonly line_count: number;
  readonly attempted: boolean;
  readonly buggy_line: number | null;
  readonly explanation_markdown: string | null;
  readonly attempt: WirePuzzleAttemptSummary | null;
}

export interface WirePuzzleAttemptRequest {
  readonly selected_line: number;
  readonly elapsed_millis: number;
}

export interface WirePuzzleAttemptResponse {
  readonly puzzle_id: string;
  readonly selected_line: number;
  readonly correct: boolean;
  readonly buggy_line: number;
  readonly explanation_markdown: string;
  readonly elapsed_millis: number;
  readonly submitted_at: string;
  readonly current_streak: number;
  readonly longest_streak: number;
}

export interface WireLeaderboardEntry {
  readonly user_id: string;
  readonly display_name: string;
  readonly elapsed_millis: number;
  readonly submitted_at: string;
  readonly current_streak: number;
}

// ---- Authoring and review ----------------------------------------------------

/** `AdminPuzzleResponse` — the same shape for the list, the queue and a single read. */
export interface WireAdminPuzzle {
  readonly id: string;
  readonly status: PuzzleStatus;
  readonly puzzle_date: string;
  readonly title: string;
  readonly prompt_markdown: string | null;
  readonly language: string;
  readonly code: string;
  readonly line_count: number;
  readonly buggy_line: number;
  readonly explanation_markdown: string;
  readonly created_by: string | null;
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

export interface WireCreatePuzzleRequest {
  readonly puzzle_date: string;
  readonly title: string;
  readonly prompt_markdown?: string;
  readonly language: string;
  readonly code: string;
  readonly buggy_line: number;
  readonly explanation_markdown: string;
}

export interface WireUpdatePuzzleRequest {
  readonly version: number;
  readonly puzzle_date?: string;
  readonly title?: string;
  readonly prompt_markdown?: string;
  readonly language?: string;
  readonly code?: string;
  readonly buggy_line?: number;
  readonly explanation_markdown?: string;
}

/** Shared by `submit`, `approve` and `reject`. */
export interface WirePuzzleTransitionRequest {
  readonly expected_status: PuzzleStatus;
  readonly reason?: string;
}

export interface WirePuzzleAuditLogItem {
  readonly id: string;
  readonly step: PuzzleStep;
  readonly actor_user_id: string;
  readonly from_status: PuzzleStatus | null;
  readonly to_status: PuzzleStatus | null;
  readonly reason: string | null;
  readonly occurred_at: string;
}

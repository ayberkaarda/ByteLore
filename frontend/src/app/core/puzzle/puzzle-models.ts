/**
 * View models for the daily bug hunt — the player's screen and the editorial
 * screens behind it.
 *
 * The same split the rest of this application uses: these are the shapes the
 * components are written against, and the two clients in this folder are the
 * only places that know the `snake_case` wire form underneath them.
 *
 * This feature is deliberately online-only, unlike every other reading
 * surface here. A shared daily puzzle with a scoreboard and a streak is a
 * claim about when something happened relative to other people, and a client
 * cannot settle that on its own — so there is no local-store counterpart to
 * these types and no availability axis on them.
 */
import type { Page } from '../platform/models';

/**
 * Editorial state of a puzzle.
 *
 * The same four names a blog post uses, so an editor reading either queue
 * sees one vocabulary — which is also why the shared status badge renders
 * both without a second component.
 */
export type PuzzleStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED';

/** One recorded step in a puzzle's life; every one of them is a human decision. */
export type PuzzleStep = 'DRAFT' | 'SUBMIT' | 'APPROVE' | 'REJECT';

/**
 * The three lifecycle transitions the server exposes as endpoints
 * (`POST .../{action}`). Deletion is not a member: it is a different verb on
 * a different path, not a status change.
 */
export type PuzzleTransitionAction = 'submit' | 'approve' | 'reject';

/** The two orders the scoreboard can be read in. */
export type LeaderboardSort = 'time' | 'streak';

/** The caller's own answer, replayed back to them. */
export interface PuzzleAttemptSummary {
  readonly selectedLine: number;
  readonly correct: boolean;
  readonly elapsedMillis: number;
  readonly submittedAt: string;
}

/**
 * Today's puzzle as a player sees it.
 *
 * `buggyLine`, `explanationMarkdown` and `attempt` are null until this player
 * has answered. The answer is not withheld by the screen — the server never
 * puts it in the response in the first place, so there is nothing here for a
 * curious reader to find in a network panel before they have played.
 */
export interface DailyPuzzle {
  readonly id: string;
  /** The day this puzzle runs, as a plain `YYYY-MM-DD` calendar date. */
  readonly puzzleDate: string;
  readonly title: string;
  readonly promptMarkdown: string | null;
  readonly language: string;
  readonly code: string;
  /** The listing's line count, so the gutter is numbered the way the server validates a click. */
  readonly lineCount: number;
  readonly attempted: boolean;
  readonly buggyLine: number | null;
  readonly explanationMarkdown: string | null;
  readonly attempt: PuzzleAttemptSummary | null;
}

export interface PuzzleAttemptInput {
  /** One-based, within the listing's line count. */
  readonly selectedLine: number;
  /** Measured on this device. It orders a scoreboard and decides nothing else. */
  readonly elapsedMillis: number;
}

/**
 * What came back from an answer: the verdict, the solution, and what the
 * answer did to this player's streak.
 *
 * The solution is returned whether the guess was right or wrong — the one
 * attempt has been spent either way, and withholding it would teach nobody
 * anything.
 */
export interface PuzzleAttemptResult {
  readonly puzzleId: string;
  readonly selectedLine: number;
  readonly correct: boolean;
  readonly buggyLine: number;
  readonly explanationMarkdown: string;
  readonly elapsedMillis: number;
  readonly submittedAt: string;
  readonly currentStreak: number;
  readonly longestStreak: number;
}

/** One line of the scoreboard. Only players who answered correctly appear. */
export interface LeaderboardEntry {
  readonly userId: string;
  readonly displayName: string;
  readonly elapsedMillis: number;
  readonly submittedAt: string;
  readonly currentStreak: number;
}

export interface LeaderboardQuery {
  readonly sort?: LeaderboardSort;
  readonly page?: number;
  readonly size?: number;
}

/**
 * A puzzle as an editor or reviewer sees it: everything, answer line and
 * explanation included. This shape never reaches the player endpoints.
 */
export interface AdminPuzzle {
  readonly id: string;
  readonly status: PuzzleStatus;
  readonly puzzleDate: string;
  readonly title: string;
  readonly promptMarkdown: string | null;
  readonly language: string;
  readonly code: string;
  readonly lineCount: number;
  readonly buggyLine: number;
  readonly explanationMarkdown: string;
  readonly createdBy: string | null;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface CreatePuzzleInput {
  readonly puzzleDate: string;
  readonly title: string;
  /** Optional context above the listing; an empty value stores no prompt at all. */
  readonly promptMarkdown?: string;
  readonly language: string;
  readonly code: string;
  readonly buggyLine: number;
  readonly explanationMarkdown: string;
}

/**
 * Every field but `version` is "leave unchanged" when omitted.
 *
 * `promptMarkdown: ''` is the one value that is not a no-op: an empty string
 * is sent, normalizes to nothing server-side, and is how a prompt is removed.
 */
export interface UpdatePuzzleInput {
  readonly version: number;
  readonly puzzleDate?: string;
  readonly title?: string;
  readonly promptMarkdown?: string;
  readonly language?: string;
  readonly code?: string;
  readonly buggyLine?: number;
  readonly explanationMarkdown?: string;
}

export interface PuzzleTransitionInput {
  /** Required on every transition, so two reviewers racing one puzzle cannot both succeed. */
  readonly expectedStatus: PuzzleStatus;
  /** Required by the server for `reject` (10–500 characters); ignored elsewhere. */
  readonly reason?: string;
}

export interface AdminPuzzleListQuery {
  readonly status?: PuzzleStatus;
  readonly q?: string;
  readonly page?: number;
  readonly size?: number;
  /** Each entry is one `field,asc|desc` token; the server accepts repeats. */
  readonly sort?: readonly string[];
}

export interface PuzzleQueueQuery {
  readonly page?: number;
  readonly size?: number;
  readonly sort?: readonly string[];
}

export interface PuzzlePageQuery {
  readonly page?: number;
  readonly size?: number;
}

export interface PuzzleAuditLogItem {
  readonly id: string;
  readonly step: PuzzleStep;
  /** Never null: every step in a puzzle's life is a decision somebody made. */
  readonly actorUserId: string;
  readonly fromStatus: PuzzleStatus | null;
  readonly toStatus: PuzzleStatus | null;
  readonly reason: string | null;
  readonly occurredAt: string;
}

export type { Page };

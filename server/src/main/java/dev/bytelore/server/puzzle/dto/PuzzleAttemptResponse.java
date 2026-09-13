package dev.bytelore.server.puzzle.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * The answer to {@code POST /puzzle/today/attempt}: what the player picked, whether it was right,
 * where the bug actually was, why -- and what the answer did to their streak.
 *
 * <p>The solution is returned here whether the guess was right or wrong. The attempt has been spent
 * either way, so withholding it would teach nobody anything.
 */
public record PuzzleAttemptResponse(
    UUID puzzleId,
    int selectedLine,
    boolean correct,
    int buggyLine,
    String explanationMarkdown,
    long elapsedMillis,
    Instant submittedAt,
    int currentStreak,
    int longestStreak) {}

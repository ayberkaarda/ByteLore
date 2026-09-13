package dev.bytelore.server.puzzle.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * One line of {@code GET /puzzle/today/leaderboard}.
 *
 * <p>Only players who answered correctly appear. A wrong answer stays between the player and the
 * puzzle: a board that listed failures would be a reason not to play.
 */
public record LeaderboardEntryResponse(
    UUID userId, String displayName, long elapsedMillis, Instant submittedAt, int currentStreak) {}

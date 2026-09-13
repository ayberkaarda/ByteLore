package dev.bytelore.server.repository;

import java.time.Instant;
import java.util.UUID;

/**
 * One scoreboard line as the database produces it: the solver, the account address their public
 * name is derived from, how long they took, and the streak they are on.
 *
 * <p>A projection rather than three entities. The scoreboard reads an attempt, an account and a
 * streak together, and loading whole rows to use four columns of them would drag a password hash
 * through the query for every line on the page.
 */
public record LeaderboardRow(
    UUID userId, String email, long elapsedMillis, Instant submittedAt, int currentStreak) {}

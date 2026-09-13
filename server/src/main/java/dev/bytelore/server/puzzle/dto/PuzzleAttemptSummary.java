package dev.bytelore.server.puzzle.dto;

import java.time.Instant;

/** The caller's own answer to a puzzle, as it is replayed back to them. */
public record PuzzleAttemptSummary(
    int selectedLine, boolean correct, long elapsedMillis, Instant submittedAt) {}

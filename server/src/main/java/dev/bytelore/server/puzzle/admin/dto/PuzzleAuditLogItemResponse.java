package dev.bytelore.server.puzzle.admin.dto;

import dev.bytelore.server.domain.PuzzleStatus;
import dev.bytelore.server.domain.PuzzleStep;
import java.time.Instant;
import java.util.UUID;

/**
 * One row of {@code GET /admin/puzzles/{id}/audit-log}. {@code actorUserId} is never null: every
 * step in a puzzle's life is a decision somebody made.
 */
public record PuzzleAuditLogItemResponse(
    UUID id,
    PuzzleStep step,
    UUID actorUserId,
    PuzzleStatus fromStatus,
    PuzzleStatus toStatus,
    String reason,
    Instant occurredAt) {}

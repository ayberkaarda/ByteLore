package dev.bytelore.server.puzzle.admin.dto;

import dev.bytelore.server.domain.PuzzleStatus;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * A puzzle as an editor or reviewer sees it: everything, answer line and explanation included.
 *
 * <p>This is the shape the review queue serves too. A reviewer who could not see the answer could
 * not review anything -- which is exactly why this shape never reaches the player endpoints.
 *
 * @param lineCount the listing's line count, so a reviewing interface can number the gutter the
 *     same way the player's will and see which line the answer points at
 */
public record AdminPuzzleResponse(
    UUID id,
    PuzzleStatus status,
    LocalDate puzzleDate,
    String title,
    String promptMarkdown,
    String language,
    String code,
    int lineCount,
    int buggyLine,
    String explanationMarkdown,
    UUID createdBy,
    Instant publishedAt,
    Instant createdAt,
    Instant updatedAt,
    long version) {}

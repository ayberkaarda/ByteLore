package dev.bytelore.server.puzzle.admin.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * {@code PATCH /admin/puzzles/{id}}. Every content field is optional; an absent one is left alone.
 *
 * <p>{@code version} is required, so two editors working the same puzzle cannot both save over each
 * other in silence. A published puzzle refuses every edit outright -- see the error catalogue's
 * note on why a published answer key is frozen.
 */
public record UpdatePuzzleRequest(
    @NotNull Long version,
    LocalDate puzzleDate,
    @Size(max = 200) String title,
    @Size(max = 4000) String promptMarkdown,
    @Size(max = 40) @Pattern(regexp = "^[a-z0-9][a-z0-9+#._-]*$") String language,
    @Size(max = 20000) String code,
    @Min(1) Integer buggyLine,
    @Size(max = 4000) String explanationMarkdown) {}

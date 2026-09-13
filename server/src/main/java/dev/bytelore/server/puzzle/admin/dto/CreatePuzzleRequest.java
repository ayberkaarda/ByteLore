package dev.bytelore.server.puzzle.admin.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * {@code POST /admin/puzzles}. Always creates a {@code DRAFT}; {@code status} is never accepted
 * from the client, because the only way to {@code PUBLISHED} is through review.
 *
 * <p>{@code buggyLine}'s upper bound is the listing's own line count and is checked in the service,
 * where the listing is in hand.
 */
public record CreatePuzzleRequest(
    @NotNull LocalDate puzzleDate,
    @NotBlank @Size(max = 200) String title,
    @Size(max = 4000) String promptMarkdown,
    @NotBlank @Size(max = 40) @Pattern(regexp = "^[a-z0-9][a-z0-9+#._-]*$") String language,
    @NotBlank @Size(max = 20000) String code,
    @NotNull @Min(1) Integer buggyLine,
    @NotBlank @Size(max = 4000) String explanationMarkdown) {}

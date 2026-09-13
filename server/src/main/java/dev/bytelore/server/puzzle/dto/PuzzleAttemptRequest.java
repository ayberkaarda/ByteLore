package dev.bytelore.server.puzzle.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * {@code POST /puzzle/today/attempt}.
 *
 * <p>The puzzle is not named in the body. There is exactly one puzzle a caller may answer -- the
 * one published for today -- so the server resolves it, and no shape of this request can reach
 * yesterday's answer key or tomorrow's.
 *
 * @param selectedLine the one-based line the player clicked. Its upper bound is the listing's line
 *     count, which is checked where the listing is in hand
 * @param elapsedMillis how long the player took, measured by their own device. Untrusted: it orders
 *     a scoreboard and decides nothing else. The ceiling is a day, which is longer than any honest
 *     sitting and short enough that a nonsense value cannot take the top of the board
 */
public record PuzzleAttemptRequest(
    @NotNull @Min(1) Integer selectedLine, @NotNull @Min(0) @Max(86_400_000L) Long elapsedMillis) {}

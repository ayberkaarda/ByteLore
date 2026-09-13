package dev.bytelore.server.puzzle.admin.dto;

import dev.bytelore.server.domain.PuzzleStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * The one request shape every puzzle lifecycle transition shares: {@code submit}, {@code approve},
 * {@code reject}.
 *
 * <p>{@code expectedStatus} is required on every transition, so two reviewers racing the same
 * puzzle can never both succeed silently. {@code reason} is required (10-500 characters) for {@code
 * reject} and optional elsewhere -- a rule the service enforces, since which action is being
 * performed is not something this shared shape can see. The length range itself applies whenever a
 * reason is given at all: {@code @Size} passes null through, so the lower bound only bites on a
 * present-but-too-short reason.
 */
public record PuzzleTransitionRequest(
    @NotNull PuzzleStatus expectedStatus, @Size(min = 10, max = 500) String reason) {}

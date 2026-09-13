package dev.bytelore.server.domain;

/**
 * Editorial state of a daily puzzle.
 *
 * <p>The same four names a blog post uses, on purpose -- an editor reading either queue sees one
 * vocabulary -- but not the same transitions. A puzzle has no path from {@code DRAFT} straight to
 * {@code PUBLISHED}: {@link #PENDING_REVIEW} is unavoidable, because a puzzle runs for everybody on
 * one day and there is no per-reader blast radius to fall back on.
 */
public enum PuzzleStatus {
  DRAFT,
  PENDING_REVIEW,
  PUBLISHED,
  REJECTED
}

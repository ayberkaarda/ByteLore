package dev.bytelore.server.domain;

/**
 * One recorded decision in a puzzle's life, stored in {@link PuzzleAuditLog}.
 *
 * <p>Every value here is something a person did. Puzzles are written by hand and there is no ingest
 * that could produce one, so this enum carries no machine step at all -- which is what lets the
 * audit table require a non-null actor on every row.
 */
public enum PuzzleStep {
  DRAFT,
  SUBMIT,
  APPROVE,
  REJECT
}

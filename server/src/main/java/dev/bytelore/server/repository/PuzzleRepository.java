package dev.bytelore.server.repository;

import dev.bytelore.server.domain.Puzzle;
import dev.bytelore.server.domain.PuzzleStatus;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Data access for {@link Puzzle}. */
public interface PuzzleRepository extends JpaRepository<Puzzle, UUID> {

  /**
   * The puzzle a given day runs, if that day has a published one.
   *
   * <p>Selected at query time rather than stamped onto a row by a scheduled job. There is no
   * "promote today's puzzle" tick to miss, to run twice, or to run against a clock that drifted:
   * the day is a column and the question is a predicate over it.
   */
  Optional<Puzzle> findByStatusAndPuzzleDate(PuzzleStatus status, LocalDate puzzleDate);

  Page<Puzzle> findByStatus(PuzzleStatus status, Pageable pageable);

  /**
   * The one puzzle holding a date, ignoring rejected ones.
   *
   * <p>The partial unique index behind the same predicate is what actually enforces this; the query
   * exists so that a create or a date change can answer with a specific error code instead of
   * letting a constraint violation surface as a generic conflict.
   */
  @Query(
      """
      SELECT p FROM Puzzle p
      WHERE p.puzzleDate = :puzzleDate
        AND p.status <> dev.bytelore.server.domain.PuzzleStatus.REJECTED
      """)
  Optional<Puzzle> findActiveByPuzzleDate(@Param("puzzleDate") LocalDate puzzleDate);

  /**
   * The editor list: {@code status} and {@code q} (a case-insensitive title substring) are each
   * optional and independent.
   *
   * <p>{@code titlePattern} is always a non-null pattern ({@code "%"} when the caller supplied no
   * search term). Comparing a null parameter through {@code LOWER(...)} leaves the driver without a
   * resolved bind type, and its fallback for an untyped null is a binary type that {@code lower()}
   * has no overload for -- so the empty search box would fail rather than match everything.
   *
   * <p>The {@code ESCAPE} clause names the character the caller's own {@code %} and {@code _} are
   * escaped with, so a search term is matched literally rather than being read as a pattern of its
   * own. It is written out even though it is the database's default: the pattern builder and this
   * query have to agree on one character, and agreeing on an unstated default is how they stop
   * agreeing.
   */
  @Query(
      """
      SELECT p FROM Puzzle p
      WHERE (:status IS NULL OR p.status = :status)
        AND LOWER(p.title) LIKE LOWER(:titlePattern) ESCAPE '\\'
      """)
  Page<Puzzle> search(
      @Param("status") PuzzleStatus status,
      @Param("titlePattern") String titlePattern,
      Pageable pageable);
}

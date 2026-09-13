package dev.bytelore.server.repository;

import dev.bytelore.server.domain.PuzzleAttempt;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Data access for {@link PuzzleAttempt} and the scoreboard built over it. */
public interface PuzzleAttemptRepository extends JpaRepository<PuzzleAttempt, UUID> {

  Optional<PuzzleAttempt> findByPuzzleIdAndUserId(UUID puzzleId, UUID userId);

  boolean existsByPuzzleIdAndUserId(UUID puzzleId, UUID userId);

  /**
   * The scoreboard ordered by how quickly the puzzle was solved.
   *
   * <p>Only correct attempts appear at all -- a wrong answer is a private fact between a player and
   * the puzzle. {@code submittedAt} breaks a tie so that two identical times come back in a stable
   * order rather than in whatever order the planner happened to produce, which is what stops a
   * player from moving up and down a page they reload twice.
   *
   * <p>The streak comes from an outer join: a player on the board has solved today, so a streak row
   * exists for them, but the join is written not to depend on that being true forever.
   */
  @Query(
      value =
          """
          SELECT new dev.bytelore.server.repository.LeaderboardRow(
              a.userId, u.email, a.elapsedMillis, a.submittedAt, COALESCE(s.currentStreak, 0))
          FROM PuzzleAttempt a
          JOIN User u ON u.id = a.userId
          LEFT JOIN UserStreak s ON s.userId = a.userId
          WHERE a.puzzleId = :puzzleId AND a.correct = true
          ORDER BY a.elapsedMillis ASC, a.submittedAt ASC
          """,
      countQuery =
          """
          SELECT COUNT(a) FROM PuzzleAttempt a
          WHERE a.puzzleId = :puzzleId AND a.correct = true
          """)
  Page<LeaderboardRow> leaderboardByTime(@Param("puzzleId") UUID puzzleId, Pageable pageable);

  /**
   * The same board ordered by the streak each solver is on, longest first, with elapsed time as the
   * tie-break -- so a page of equal streaks reads the same way the time board does.
   */
  @Query(
      value =
          """
          SELECT new dev.bytelore.server.repository.LeaderboardRow(
              a.userId, u.email, a.elapsedMillis, a.submittedAt, COALESCE(s.currentStreak, 0))
          FROM PuzzleAttempt a
          JOIN User u ON u.id = a.userId
          LEFT JOIN UserStreak s ON s.userId = a.userId
          WHERE a.puzzleId = :puzzleId AND a.correct = true
          ORDER BY COALESCE(s.currentStreak, 0) DESC, a.elapsedMillis ASC, a.submittedAt ASC
          """,
      countQuery =
          """
          SELECT COUNT(a) FROM PuzzleAttempt a
          WHERE a.puzzleId = :puzzleId AND a.correct = true
          """)
  Page<LeaderboardRow> leaderboardByStreak(@Param("puzzleId") UUID puzzleId, Pageable pageable);

  /**
   * Deletes one puzzle's attempts ahead of deleting the puzzle itself.
   *
   * <p>A puzzle can only be deleted before it has ever been published, so in practice there is
   * nothing here to remove; the method exists so that the delete path does not depend on that
   * remaining true and hand a foreign key violation to the caller if it stops being.
   */
  @Modifying
  @Query("DELETE FROM PuzzleAttempt a WHERE a.puzzleId = :puzzleId")
  void deleteByPuzzleId(@Param("puzzleId") UUID puzzleId);
}

package dev.bytelore.server.repository;

import dev.bytelore.server.domain.PuzzleAuditLog;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Data access for {@link PuzzleAuditLog}. Append-only: nothing here updates a row. */
public interface PuzzleAuditLogRepository extends JpaRepository<PuzzleAuditLog, UUID> {

  List<PuzzleAuditLog> findByPuzzleIdOrderByOccurredAtAsc(UUID puzzleId);

  Page<PuzzleAuditLog> findByPuzzleId(UUID puzzleId, Pageable pageable);

  /**
   * Deletes one puzzle's trail ahead of deleting the puzzle itself. The foreign key is deliberately
   * not {@code ON DELETE CASCADE} -- the trail is append-only and nothing else writes to it -- so
   * the puzzle's own deletion is the single caller allowed to take its history down with it.
   */
  @Modifying
  @Query("DELETE FROM PuzzleAuditLog p WHERE p.puzzleId = :puzzleId")
  void deleteByPuzzleId(@Param("puzzleId") UUID puzzleId);
}

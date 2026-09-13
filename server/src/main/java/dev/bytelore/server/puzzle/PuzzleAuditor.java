package dev.bytelore.server.puzzle;

import dev.bytelore.server.common.UuidV7;
import dev.bytelore.server.domain.PuzzleAuditLog;
import dev.bytelore.server.domain.PuzzleStatus;
import dev.bytelore.server.domain.PuzzleStep;
import dev.bytelore.server.repository.PuzzleAuditLogRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The one place a {@link PuzzleAuditLog} row is written. Every draft, submit, approve and reject
 * goes through here, in the same transaction as the change it describes -- a transition that cannot
 * be audited does not happen. The trail has no write endpoint of its own on the API.
 */
@Component
public class PuzzleAuditor {

  private final PuzzleAuditLogRepository repository;
  private final Clock clock;

  public PuzzleAuditor(PuzzleAuditLogRepository repository, Clock clock) {
    this.repository = repository;
    this.clock = clock;
  }

  /**
   * Records one decision.
   *
   * @param actorUserId the person who made it; never null, because no machine makes one
   */
  public PuzzleAuditLog record(
      PuzzleStep step,
      UUID puzzleId,
      UUID actorUserId,
      PuzzleStatus fromStatus,
      PuzzleStatus toStatus,
      String reason) {
    PuzzleAuditLog log = new PuzzleAuditLog();
    log.setId(UuidV7.randomUuid());
    log.setStep(step);
    log.setPuzzleId(puzzleId);
    log.setActorUserId(actorUserId);
    log.setFromStatus(fromStatus);
    log.setToStatus(toStatus);
    log.setReason(reason);
    log.setOccurredAt(Instant.now(clock).truncatedTo(ChronoUnit.MILLIS));
    return repository.save(log);
  }
}

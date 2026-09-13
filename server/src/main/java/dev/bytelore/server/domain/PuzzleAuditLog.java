package dev.bytelore.server.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * One append-only record of a human decision about a puzzle, written in the same transaction as the
 * transition it describes.
 *
 * <p>{@code actorUserId} is never null here. There is no machine that drafts, submits, approves or
 * rejects a puzzle, so a row with no actor would describe something that cannot have happened.
 */
@Entity
@Table(name = "puzzle_audit_log")
public class PuzzleAuditLog {

  @Id private UUID id;

  @Enumerated(EnumType.STRING)
  @Column(name = "step", nullable = false, length = 16)
  private PuzzleStep step;

  @Column(name = "puzzle_id", nullable = false)
  private UUID puzzleId;

  @Column(name = "actor_user_id", nullable = false)
  private UUID actorUserId;

  @Enumerated(EnumType.STRING)
  @Column(name = "from_status", length = 20)
  private PuzzleStatus fromStatus;

  @Enumerated(EnumType.STRING)
  @Column(name = "to_status", length = 20)
  private PuzzleStatus toStatus;

  @Column(name = "reason", length = 500)
  private String reason;

  @Column(name = "occurred_at", nullable = false)
  private Instant occurredAt;

  public PuzzleAuditLog() {}

  public UUID getId() {
    return id;
  }

  public void setId(UUID id) {
    this.id = id;
  }

  public PuzzleStep getStep() {
    return step;
  }

  public void setStep(PuzzleStep step) {
    this.step = step;
  }

  public UUID getPuzzleId() {
    return puzzleId;
  }

  public void setPuzzleId(UUID puzzleId) {
    this.puzzleId = puzzleId;
  }

  public UUID getActorUserId() {
    return actorUserId;
  }

  public void setActorUserId(UUID actorUserId) {
    this.actorUserId = actorUserId;
  }

  public PuzzleStatus getFromStatus() {
    return fromStatus;
  }

  public void setFromStatus(PuzzleStatus fromStatus) {
    this.fromStatus = fromStatus;
  }

  public PuzzleStatus getToStatus() {
    return toStatus;
  }

  public void setToStatus(PuzzleStatus toStatus) {
    this.toStatus = toStatus;
  }

  public String getReason() {
    return reason;
  }

  public void setReason(String reason) {
    this.reason = reason;
  }

  public Instant getOccurredAt() {
    return occurredAt;
  }

  public void setOccurredAt(Instant occurredAt) {
    this.occurredAt = occurredAt;
  }
}

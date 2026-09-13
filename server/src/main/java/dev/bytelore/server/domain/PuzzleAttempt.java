package dev.bytelore.server.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * One player's single answer to one puzzle.
 *
 * <p>There is no update path: a row is written once and never changed, which is what makes "one
 * shot per day" mean what it says. {@code elapsedMillis} is the client's own measurement and is
 * trusted for nothing except ordering a scoreboard.
 */
@Entity
@Table(name = "puzzle_attempts")
public class PuzzleAttempt {

  @Id private UUID id;

  @Column(name = "puzzle_id", nullable = false)
  private UUID puzzleId;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "selected_line", nullable = false)
  private int selectedLine;

  @Column(name = "correct", nullable = false)
  private boolean correct;

  @Column(name = "elapsed_millis", nullable = false)
  private long elapsedMillis;

  @Column(name = "submitted_at", nullable = false)
  private Instant submittedAt;

  public PuzzleAttempt() {}

  public UUID getId() {
    return id;
  }

  public void setId(UUID id) {
    this.id = id;
  }

  public UUID getPuzzleId() {
    return puzzleId;
  }

  public void setPuzzleId(UUID puzzleId) {
    this.puzzleId = puzzleId;
  }

  public UUID getUserId() {
    return userId;
  }

  public void setUserId(UUID userId) {
    this.userId = userId;
  }

  public int getSelectedLine() {
    return selectedLine;
  }

  public void setSelectedLine(int selectedLine) {
    this.selectedLine = selectedLine;
  }

  public boolean isCorrect() {
    return correct;
  }

  public void setCorrect(boolean correct) {
    this.correct = correct;
  }

  public long getElapsedMillis() {
    return elapsedMillis;
  }

  public void setElapsedMillis(long elapsedMillis) {
    this.elapsedMillis = elapsedMillis;
  }

  public Instant getSubmittedAt() {
    return submittedAt;
  }

  public void setSubmittedAt(Instant submittedAt) {
    this.submittedAt = submittedAt;
  }
}

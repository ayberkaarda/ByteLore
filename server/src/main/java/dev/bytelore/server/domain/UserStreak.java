package dev.bytelore.server.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * How many days in a row one player has solved the daily puzzle, and the best run they have ever
 * had.
 *
 * <p>Nothing ever writes a "the streak broke" event. {@link #lastSolvedDate} carries the whole
 * answer: the next correct solve either continues from the day before or starts again at one, and a
 * player who stopped playing simply has an old date sitting here until they come back. That is what
 * makes this table correct without a nightly job -- a job that would have to run, on time, against
 * every account, to produce a fact that arithmetic already gives away for free.
 */
@Entity
@Table(name = "user_streaks")
public class UserStreak {

  @Id
  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "current_streak", nullable = false)
  private int currentStreak;

  @Column(name = "longest_streak", nullable = false)
  private int longestStreak;

  @Column(name = "last_solved_date")
  private LocalDate lastSolvedDate;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  public UserStreak() {}

  public UUID getUserId() {
    return userId;
  }

  public void setUserId(UUID userId) {
    this.userId = userId;
  }

  public int getCurrentStreak() {
    return currentStreak;
  }

  public void setCurrentStreak(int currentStreak) {
    this.currentStreak = currentStreak;
  }

  public int getLongestStreak() {
    return longestStreak;
  }

  public void setLongestStreak(int longestStreak) {
    this.longestStreak = longestStreak;
  }

  public LocalDate getLastSolvedDate() {
    return lastSolvedDate;
  }

  public void setLastSolvedDate(LocalDate lastSolvedDate) {
    this.lastSolvedDate = lastSolvedDate;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(Instant updatedAt) {
    this.updatedAt = updatedAt;
  }
}

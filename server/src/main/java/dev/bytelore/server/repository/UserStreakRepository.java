package dev.bytelore.server.repository;

import dev.bytelore.server.domain.UserStreak;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * One row per player who has ever solved a daily puzzle. Rows appear on a player's first correct
 * answer and are never deleted -- {@code longest_streak} is a record, and a record that can vanish
 * is not one.
 */
public interface UserStreakRepository extends JpaRepository<UserStreak, UUID> {}

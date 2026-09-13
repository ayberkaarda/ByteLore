package dev.bytelore.server.puzzle;

import dev.bytelore.server.common.ApiException;
import dev.bytelore.server.common.ErrorCode;
import dev.bytelore.server.common.PageQuery;
import dev.bytelore.server.common.PageResponse;
import dev.bytelore.server.common.UuidV7;
import dev.bytelore.server.domain.Puzzle;
import dev.bytelore.server.domain.PuzzleAttempt;
import dev.bytelore.server.domain.PuzzleStatus;
import dev.bytelore.server.domain.UserStreak;
import dev.bytelore.server.puzzle.dto.LeaderboardEntryResponse;
import dev.bytelore.server.puzzle.dto.PuzzleAttemptRequest;
import dev.bytelore.server.puzzle.dto.PuzzleAttemptResponse;
import dev.bytelore.server.puzzle.dto.PuzzleAttemptSummary;
import dev.bytelore.server.puzzle.dto.TodayPuzzleResponse;
import dev.bytelore.server.repository.LeaderboardRow;
import dev.bytelore.server.repository.PuzzleAttemptRepository;
import dev.bytelore.server.repository.PuzzleRepository;
import dev.bytelore.server.repository.UserStreakRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The player's half of the daily bug hunt: read today's puzzle, answer it once, and see who solved
 * it fastest.
 *
 * <p>This feature requires a signed-in caller and does not work offline, which is the one place in
 * the product where that is true. It is a competition over a single shared puzzle: a scoreboard
 * position and a streak are claims about when something happened relative to other people, and a
 * client that recorded them alone and reconciled them later would be asserting a race result it
 * refereed itself.
 *
 * <p>Every method takes the caller's identity from the verified access token, passed in by the
 * controller. No endpoint on this service accepts a user identifier in a body, a path or a query
 * parameter, so no shape of request reads or writes somebody else's attempt or streak.
 */
@Service
public class PuzzleService {

  private static final Map<String, String> LEADERBOARD_SORT_FIELDS = Map.of();
  private static final Sort UNSORTED = Sort.unsorted();

  private final PuzzleRepository puzzles;
  private final PuzzleAttemptRepository attempts;
  private final UserStreakRepository streaks;
  private final Clock clock;

  public PuzzleService(
      PuzzleRepository puzzles,
      PuzzleAttemptRepository attempts,
      UserStreakRepository streaks,
      Clock clock) {
    this.puzzles = puzzles;
    this.attempts = attempts;
    this.streaks = streaks;
    this.clock = clock;
  }

  /**
   * Today's puzzle, with the answer withheld until the caller has spent their attempt.
   *
   * <p>"Today" is resolved here, from the injected clock, against the {@code puzzle_date} column --
   * there is no scheduled job that promotes a puzzle at midnight and therefore no tick to miss,
   * double-fire, or run against a clock that drifted.
   */
  @Transactional(readOnly = true)
  public TodayPuzzleResponse today(UUID callerUserId) {
    Puzzle puzzle = requireTodaysPuzzle();
    int lineCount = PuzzleCode.lineCount(puzzle.getCode());

    Optional<PuzzleAttempt> own = attempts.findByPuzzleIdAndUserId(puzzle.getId(), callerUserId);
    if (own.isEmpty()) {
      return TodayPuzzleResponse.unanswered(
          puzzle.getId(),
          puzzle.getPuzzleDate(),
          puzzle.getTitle(),
          puzzle.getPromptMarkdown(),
          puzzle.getLanguage(),
          puzzle.getCode(),
          lineCount);
    }

    PuzzleAttempt attempt = own.get();
    return TodayPuzzleResponse.answered(
        puzzle.getId(),
        puzzle.getPuzzleDate(),
        puzzle.getTitle(),
        puzzle.getPromptMarkdown(),
        puzzle.getLanguage(),
        puzzle.getCode(),
        lineCount,
        puzzle.getBuggyLine(),
        puzzle.getExplanationMarkdown(),
        toSummary(attempt));
  }

  /**
   * Records the caller's single answer to today's puzzle and settles what it did to their streak.
   *
   * <p>One transaction covers the attempt row and the streak row together. They are two statements
   * describing one event, and a run that wrote the attempt and then failed before the streak would
   * leave a player who solved the puzzle with a streak that says they did not -- unrecoverably,
   * because the attempt they would need to replay is already spent.
   */
  @Transactional
  public PuzzleAttemptResponse attempt(UUID callerUserId, PuzzleAttemptRequest request) {
    Puzzle puzzle = requireTodaysPuzzle();
    int selectedLine = request.selectedLine();
    PuzzleCode.requireLineWithinCode(selectedLine, puzzle.getCode(), "selected_line");

    if (attempts.existsByPuzzleIdAndUserId(puzzle.getId(), callerUserId)) {
      throw new ApiException(
          ErrorCode.PUZZLE_ALREADY_ATTEMPTED, "Today's puzzle has already been answered.");
    }

    Instant now = now();
    boolean correct = selectedLine == puzzle.getBuggyLine();

    PuzzleAttempt attempt = new PuzzleAttempt();
    attempt.setId(UuidV7.randomUuid());
    attempt.setPuzzleId(puzzle.getId());
    attempt.setUserId(callerUserId);
    attempt.setSelectedLine(selectedLine);
    attempt.setCorrect(correct);
    attempt.setElapsedMillis(request.elapsedMillis());
    attempt.setSubmittedAt(now);
    try {
      // Flushed rather than left to commit, so that the unique index is what decides a race
      // between two requests from the same player -- both of which passed the check above -- and
      // so that the loser is told which rule it broke instead of receiving a generic conflict.
      attempts.saveAndFlush(attempt);
    } catch (DataIntegrityViolationException e) {
      throw new ApiException(
          ErrorCode.PUZZLE_ALREADY_ATTEMPTED, "Today's puzzle has already been answered.", e);
    }

    UserStreak streak = applyStreak(callerUserId, puzzle.getPuzzleDate(), correct, now);

    return new PuzzleAttemptResponse(
        puzzle.getId(),
        selectedLine,
        correct,
        puzzle.getBuggyLine(),
        puzzle.getExplanationMarkdown(),
        attempt.getElapsedMillis(),
        attempt.getSubmittedAt(),
        streak.getCurrentStreak(),
        streak.getLongestStreak());
  }

  /**
   * The scoreboard for today's puzzle.
   *
   * @param sort {@code "time"} (default) for the fastest correct solvers, {@code "streak"} for the
   *     longest runs among them
   */
  @Transactional(readOnly = true)
  public PageResponse<LeaderboardEntryResponse> leaderboard(
      String sort, Integer page, Integer size) {
    Puzzle puzzle = requireTodaysPuzzle();
    // The ordering is fixed by the query, not assembled from caller-supplied sort tokens: there
    // are exactly two boards and each has one correct order, tie-break included.
    Pageable pageable = PageQuery.resolve(page, size, null, LEADERBOARD_SORT_FIELDS, UNSORTED);

    Page<LeaderboardRow> result =
        switch (parseLeaderboardSort(sort)) {
          case TIME -> attempts.leaderboardByTime(puzzle.getId(), pageable);
          case STREAK -> attempts.leaderboardByStreak(puzzle.getId(), pageable);
        };

    List<LeaderboardEntryResponse> items =
        result.getContent().stream()
            .map(
                row ->
                    new LeaderboardEntryResponse(
                        row.userId(),
                        PlayerName.fromEmail(row.email()),
                        row.elapsedMillis(),
                        row.submittedAt(),
                        row.currentStreak()))
            .toList();
    return PageResponse.of(items, result.getNumber(), result.getSize(), result.getTotalElements());
  }

  // ---- Internals ------------------------------------------------------------------------------

  /** The two boards the scoreboard offers. */
  private enum LeaderboardSort {
    TIME,
    STREAK
  }

  private static LeaderboardSort parseLeaderboardSort(String value) {
    if (value == null || value.isBlank() || "time".equalsIgnoreCase(value)) {
      return LeaderboardSort.TIME;
    }
    if ("streak".equalsIgnoreCase(value)) {
      return LeaderboardSort.STREAK;
    }
    throw new ApiException(
        ErrorCode.INVALID_PARAMETER,
        "'sort' must be 'time' or 'streak', got '%s'.".formatted(value));
  }

  /**
   * Moves the caller's streak on by one day, restarts it, or leaves it alone.
   *
   * <p>A wrong answer touches nothing. The break is not an event anybody records: it is the gap
   * between {@code last_solved_date} and the next date solved, read at the moment the next correct
   * answer arrives. A player who missed Wednesday shows up on Thursday with Tuesday still on their
   * row, the dates fail to be consecutive, and the run restarts at one. Nothing had to run at
   * midnight for that to be true.
   */
  private UserStreak applyStreak(UUID userId, LocalDate puzzleDate, boolean correct, Instant now) {
    UserStreak streak = streaks.findById(userId).orElseGet(() -> newStreak(userId, now));
    if (!correct) {
      return streak;
    }

    LocalDate lastSolved = streak.getLastSolvedDate();
    if (lastSolved == null || lastSolved.isBefore(puzzleDate)) {
      boolean consecutive = puzzleDate.minusDays(1).equals(lastSolved);
      streak.setCurrentStreak(consecutive ? streak.getCurrentStreak() + 1 : 1);
      streak.setLastSolvedDate(puzzleDate);
    }
    // The remaining branch -- a stored date at or after the one just solved -- cannot arise while a
    // player may answer only the day's own puzzle and only once. It is left as a no-op on purpose
    // rather than as an unreachable throw: if a later change ever makes it reachable, the harm of
    // silently resetting a legitimate run to one is worse than the harm of not counting a day.
    streak.setLongestStreak(Math.max(streak.getLongestStreak(), streak.getCurrentStreak()));
    streak.setUpdatedAt(now);
    return streaks.save(streak);
  }

  private static UserStreak newStreak(UUID userId, Instant now) {
    UserStreak streak = new UserStreak();
    streak.setUserId(userId);
    streak.setCurrentStreak(0);
    streak.setLongestStreak(0);
    streak.setLastSolvedDate(null);
    streak.setUpdatedAt(now);
    return streak;
  }

  private Puzzle requireTodaysPuzzle() {
    LocalDate today = LocalDate.now(clock);
    return puzzles
        .findByStatusAndPuzzleDate(PuzzleStatus.PUBLISHED, today)
        .orElseThrow(
            () ->
                new ApiException(
                    ErrorCode.PUZZLE_NOT_FOUND, "No puzzle is published for %s.".formatted(today)));
  }

  private static PuzzleAttemptSummary toSummary(PuzzleAttempt attempt) {
    return new PuzzleAttemptSummary(
        attempt.getSelectedLine(),
        attempt.isCorrect(),
        attempt.getElapsedMillis(),
        attempt.getSubmittedAt());
  }

  private Instant now() {
    return Instant.now(clock).truncatedTo(ChronoUnit.MILLIS);
  }
}

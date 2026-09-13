package dev.bytelore.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import dev.bytelore.server.auth.dto.AuthResponse;
import dev.bytelore.server.auth.dto.LoginRequest;
import dev.bytelore.server.common.UuidV7;
import dev.bytelore.server.domain.PuzzleStatus;
import dev.bytelore.server.domain.Role;
import dev.bytelore.server.domain.Theme;
import dev.bytelore.server.domain.User;
import dev.bytelore.server.domain.UserLocale;
import dev.bytelore.server.puzzle.admin.dto.CreatePuzzleRequest;
import dev.bytelore.server.puzzle.admin.dto.PuzzleTransitionRequest;
import dev.bytelore.server.puzzle.admin.dto.UpdatePuzzleRequest;
import dev.bytelore.server.puzzle.dto.PuzzleAttemptRequest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

/**
 * The daily bug hunt end to end, against a real Postgres Testcontainer.
 *
 * <p>Two rules carry this class. The first is that <strong>a puzzle reaches players only through
 * review</strong>: unlike a manually written blog post, there is no author-publishes-their-own path
 * at all, because one puzzle runs for the entire platform on one day. The second is that
 * <strong>the answer is not in the question</strong>: the answer line and the explanation are
 * absent from the player's view of a puzzle until that player has spent their single attempt on it.
 *
 * <p>Days are moved with a fake clock rather than waited for, so that a streak spanning four
 * calendar days is exercised in one test method. Each test claims its own block of far-future dates
 * and removes its rows afterwards, because the Spring context -- and the container behind it -- is
 * cached and shared between test methods.
 *
 * <p>Access tokens are short-lived, so a test that moves the clock forward by a day
 * re-authenticates afterwards. That is not a workaround: it is the same thing the real client does,
 * and a test that kept using a token minted a simulated day earlier would be asserting against a
 * session the server would have rejected.
 */
class PuzzleIT extends ContentApiTestSupport {

  @TestConfiguration(proxyBeanMethods = false)
  static class ClockTestConfiguration {

    /**
     * Marked {@code @Primary} so it wins over the production clock bean without redefining it: the
     * two beans have different names, so this is an additional candidate rather than an override.
     */
    @Bean
    @Primary
    MutableClock mutableClock() {
      return new MutableClock(Instant.now());
    }
  }

  /**
   * Five lines, with an off-by-one on the second: the loop condition admits an index one past the
   * end of the array.
   */
  private static final String CODE =
      String.join(
          "\n",
          "int total = 0;",
          "for (int i = 0; i <= items.length; i++) {",
          "  total += items[i];",
          "}",
          "return total;");

  private static final int CODE_LINES = 5;
  private static final int BUGGY_LINE = 2;
  private static final String EXPLANATION =
      "The loop condition uses `<=`, so the last iteration reads one element past the end of the "
          + "array. The bound has to be `<`.";
  private static final String PLAYER_PASSWORD = "fixture-password-2026";

  /**
   * Test fixtures live in a year no real puzzle will ever be authored for, so they can never
   * collide with a date another suite or a seed migration happens to use. Each call hands out a
   * block of ten consecutive days, which is more than any single test needs.
   */
  private static final LocalDate DATE_BASE = LocalDate.of(2400, 1, 1);

  private static final AtomicInteger DATE_BLOCK = new AtomicInteger();

  @Autowired private MutableClock clock;

  private final List<UUID> createdPuzzleIds = new ArrayList<>();
  private final List<UUID> createdUserIds = new ArrayList<>();

  @BeforeEach
  void resetClock() {
    // The clock bean is a singleton inside a cached context: a test that left it in the year 2400
    // would hand every later test an expired session and a day with no puzzle in it.
    clock.set(Instant.now());
  }

  @AfterEach
  void removeFixtures() {
    JdbcTemplate jdbc = new JdbcTemplate(dataSource);
    for (UUID puzzleId : createdPuzzleIds) {
      jdbc.update("DELETE FROM puzzle_attempts WHERE puzzle_id = ?", puzzleId);
      jdbc.update("DELETE FROM puzzle_audit_log WHERE puzzle_id = ?", puzzleId);
      jdbc.update("DELETE FROM puzzles WHERE id = ?", puzzleId);
    }
    createdPuzzleIds.clear();
    for (UUID userId : createdUserIds) {
      jdbc.update("DELETE FROM user_streaks WHERE user_id = ?", userId);
    }
    createdUserIds.clear();
  }

  // ---- Review is the only road to the public ---------------------------------------------------

  /**
   * The whole point of the lifecycle, in one method: a puzzle that has not been reviewed cannot be
   * published, by anybody.
   *
   * <p>The approval is attempted straight from {@code DRAFT} by an administrator -- the most
   * privileged caller there is -- and refused, before the same puzzle is walked through the legal
   * path. Asserting the refusal against the highest privilege level is what makes this a statement
   * about the transition rather than about one role's permissions.
   */
  @Test
  void aPuzzleReachesPlayersOnlyThroughReview() throws Exception {
    LocalDate day = nextDateBlock();
    String editor = editorToken();
    String admin = adminToken();

    UUID puzzleId = createDraft(editor, day, "Off by one");

    MvcResult straightToPublished =
        mockMvc
            .perform(transition(admin, puzzleId, "approve", PuzzleStatus.DRAFT, null))
            .andReturn();
    assertThat(straightToPublished.getResponse().getStatus()).isEqualTo(409);
    assertThat(errorCode(straightToPublished)).isEqualTo("INVALID_STATE_TRANSITION");

    MvcResult submitted =
        mockMvc
            .perform(transition(editor, puzzleId, "submit", PuzzleStatus.DRAFT, null))
            .andReturn();
    assertThat(submitted.getResponse().getStatus()).isEqualTo(200);
    assertThat(json(submitted).path("status").asString()).isEqualTo("PENDING_REVIEW");

    MvcResult approved =
        mockMvc
            .perform(transition(admin, puzzleId, "approve", PuzzleStatus.PENDING_REVIEW, null))
            .andReturn();
    assertThat(approved.getResponse().getStatus()).isEqualTo(200);
    assertThat(json(approved).path("status").asString()).isEqualTo("PUBLISHED");
    assertThat(json(approved).path("published_at").isNull()).isFalse();

    MvcResult trail =
        mockMvc
            .perform(
                get("/api/v1/admin/puzzles/{id}/audit-log", puzzleId)
                    .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
            .andReturn();
    assertThat(trail.getResponse().getStatus()).isEqualTo(200);
    List<String> steps = new ArrayList<>();
    for (JsonNode item : json(trail).path("items")) {
      steps.add(item.path("step").asString());
      // Every step of a puzzle's life is a person's decision, so no row may be actorless.
      assertThat(item.path("actor_user_id").isNull()).isFalse();
    }
    assertThat(steps).containsExactly("DRAFT", "SUBMIT", "APPROVE");
  }

  /**
   * A rejection needs a written reason, and sends the puzzle back to its author rather than away.
   */
  @Test
  void aRejectionNeedsAReasonAndLeavesTheAuthorAWayBack() throws Exception {
    LocalDate day = nextDateBlock();
    String editor = editorToken();
    String admin = adminToken();

    UUID puzzleId = createDraft(editor, day, "Needs work");
    mockMvc.perform(transition(editor, puzzleId, "submit", PuzzleStatus.DRAFT, null)).andReturn();

    MvcResult reasonless =
        mockMvc
            .perform(transition(admin, puzzleId, "reject", PuzzleStatus.PENDING_REVIEW, null))
            .andReturn();
    assertThat(reasonless.getResponse().getStatus()).isEqualTo(400);
    assertThat(errorCode(reasonless)).isEqualTo("VALIDATION_FAILED");

    MvcResult rejected =
        mockMvc
            .perform(
                transition(
                    admin,
                    puzzleId,
                    "reject",
                    PuzzleStatus.PENDING_REVIEW,
                    "The bug is on a line the listing does not show."))
            .andReturn();
    assertThat(rejected.getResponse().getStatus()).isEqualTo(200);
    assertThat(json(rejected).path("status").asString()).isEqualTo("REJECTED");

    MvcResult resubmitted =
        mockMvc
            .perform(transition(editor, puzzleId, "submit", PuzzleStatus.REJECTED, null))
            .andReturn();
    assertThat(resubmitted.getResponse().getStatus()).isEqualTo(200);
    assertThat(json(resubmitted).path("status").asString()).isEqualTo("PENDING_REVIEW");
  }

  /**
   * One day belongs to one live puzzle -- and rejecting a puzzle gives its day back.
   *
   * <p>Both halves matter. Without the first, two puzzles could be published for the same date and
   * which one players saw would come down to the query planner. Without the second, a single
   * rejected draft would hold a calendar day hostage forever.
   */
  @Test
  void aDayBelongsToOneLivePuzzleAndRejectionGivesItBack() throws Exception {
    LocalDate day = nextDateBlock();
    String editor = editorToken();
    String admin = adminToken();

    UUID first = createDraft(editor, day, "First claim");

    MvcResult duplicate =
        mockMvc
            .perform(
                post("/api/v1/admin/puzzles")
                    .header(HttpHeaders.AUTHORIZATION, bearer(editor))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        jsonMapper.writeValueAsString(
                            new CreatePuzzleRequest(
                                day, "Second claim", null, "java", CODE, BUGGY_LINE, EXPLANATION))))
            .andReturn();
    assertThat(duplicate.getResponse().getStatus()).isEqualTo(409);
    assertThat(errorCode(duplicate)).isEqualTo("PUZZLE_DATE_ALREADY_TAKEN");

    mockMvc.perform(transition(editor, first, "submit", PuzzleStatus.DRAFT, null)).andReturn();
    mockMvc
        .perform(
            transition(
                admin,
                first,
                "reject",
                PuzzleStatus.PENDING_REVIEW,
                "Superseded by a clearer listing for the same day."))
        .andReturn();

    UUID second = createDraft(editor, day, "Second claim");
    assertThat(second).isNotEqualTo(first);
  }

  /** A published puzzle is frozen: people have already answered it. */
  @Test
  void aPublishedPuzzleRefusesEdits() throws Exception {
    LocalDate day = nextDateBlock();
    String editor = editorToken();
    String admin = adminToken();
    UUID puzzleId = publishPuzzle(editor, admin, day, "Frozen");

    MvcResult read =
        mockMvc
            .perform(
                get("/api/v1/admin/puzzles/{id}", puzzleId)
                    .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
            .andReturn();
    long version = json(read).path("version").asLong();

    MvcResult edit =
        mockMvc
            .perform(
                patch("/api/v1/admin/puzzles/{id}", puzzleId)
                    .header(HttpHeaders.AUTHORIZATION, bearer(editor))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        jsonMapper.writeValueAsString(
                            new UpdatePuzzleRequest(
                                version, null, "Renamed", null, null, null, null, null))))
            .andReturn();
    assertThat(edit.getResponse().getStatus()).isEqualTo(409);
    assertThat(errorCode(edit)).isEqualTo("PUZZLE_NOT_EDITABLE");

    MvcResult removal =
        mockMvc
            .perform(
                delete("/api/v1/admin/puzzles/{id}", puzzleId)
                    .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
            .andReturn();
    assertThat(removal.getResponse().getStatus()).isEqualTo(409);
    assertThat(errorCode(removal)).isEqualTo("PUBLISHED_DELETE_BLOCKED");
  }

  /**
   * A puzzle edited while it is waiting for a decision goes back to its author, and the trail says
   * so.
   *
   * <p>The rule this protects is that a reviewer approves the listing they read. Left in {@code
   * PENDING_REVIEW}, an edit could move the answer line under a reviewer who had already opened the
   * puzzle, and the approval would then be recorded against a listing nobody reviewed -- with
   * nothing in the audit trail to show that anything had changed. So the edit is allowed and the
   * review is withdrawn: the author resubmits, and the decision is made again on what is actually
   * there.
   */
  @Test
  void editingAPuzzleAwaitingReviewWithdrawsItFromReviewAndSaysSo() throws Exception {
    LocalDate day = nextDateBlock();
    String editor = editorToken();
    String admin = adminToken();

    UUID puzzleId = createDraft(editor, day, "Awaiting a decision");
    MvcResult submitted =
        mockMvc
            .perform(transition(editor, puzzleId, "submit", PuzzleStatus.DRAFT, null))
            .andReturn();
    assertThat(submitted.getResponse().getStatus()).isEqualTo(200);
    assertThat(json(submitted).path("status").asString()).isEqualTo("PENDING_REVIEW");

    MvcResult read =
        mockMvc
            .perform(
                get("/api/v1/admin/puzzles/{id}", puzzleId)
                    .header(HttpHeaders.AUTHORIZATION, bearer(editor)))
            .andReturn();
    long version = json(read).path("version").asLong();

    MvcResult edited =
        mockMvc
            .perform(
                patch("/api/v1/admin/puzzles/{id}", puzzleId)
                    .header(HttpHeaders.AUTHORIZATION, bearer(editor))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        jsonMapper.writeValueAsString(
                            new UpdatePuzzleRequest(
                                version,
                                null,
                                "Rewritten mid-review",
                                null,
                                null,
                                null,
                                null,
                                null))))
            .andReturn();
    assertThat(edited.getResponse().getStatus()).isEqualTo(200);
    assertThat(json(edited).path("status").asString()).isEqualTo("DRAFT");
    assertThat(json(edited).path("published_at").isNull()).isTrue();

    MvcResult trail =
        mockMvc
            .perform(
                get("/api/v1/admin/puzzles/{id}/audit-log", puzzleId)
                    .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
            .andReturn();
    assertThat(trail.getResponse().getStatus()).isEqualTo(200);
    List<String> steps = new ArrayList<>();
    JsonNode withdrawal = null;
    for (JsonNode item : json(trail).path("items")) {
      steps.add(item.path("step").asString());
      if ("DRAFT".equals(item.path("step").asString())
          && "PENDING_REVIEW".equals(item.path("from_status").asString())) {
        withdrawal = item;
      }
    }
    // Two DRAFT steps: the one that created the puzzle (from nothing) and the one that took it
    // back out of review. Same step, different origin -- which is what the from_status is for.
    assertThat(steps).containsExactlyInAnyOrder("DRAFT", "SUBMIT", "DRAFT");
    assertThat(withdrawal).isNotNull();
    assertThat(withdrawal.path("to_status").asString()).isEqualTo("DRAFT");
    assertThat(withdrawal.path("actor_user_id").isNull()).isFalse();

    // And the puzzle is genuinely back in the author's hands rather than merely labelled so.
    MvcResult resubmitted =
        mockMvc
            .perform(transition(editor, puzzleId, "submit", PuzzleStatus.DRAFT, null))
            .andReturn();
    assertThat(resubmitted.getResponse().getStatus()).isEqualTo(200);
  }

  /**
   * The search box is a search box, not a pattern language: a term containing {@code %} or {@code
   * _} matches the titles that literally contain those characters.
   *
   * <p>Unescaped, the term below would read {@code %} as "anything" and {@code _} as "any single
   * character", so the decoy title -- which shares no such text -- would come back as a match.
   */
  @Test
  void theTitleSearchTreatsWildcardCharactersAsLiterals() throws Exception {
    String editor = editorToken();
    LocalDate day = nextDateBlock();
    String marker = "esc" + UUID.randomUUID().toString().substring(0, 8);
    String term = marker + " a%b_c";

    UUID literal = createDraft(editor, day, term);
    createDraft(editor, day.plusDays(1), marker + " axxbyc");

    MvcResult result =
        mockMvc
            .perform(
                get("/api/v1/admin/puzzles")
                    .param("q", term)
                    .param("size", "50")
                    .header(HttpHeaders.AUTHORIZATION, bearer(editor)))
            .andReturn();
    assertThat(result.getResponse().getStatus()).isEqualTo(200);

    List<UUID> matched = new ArrayList<>();
    for (JsonNode item : json(result).path("items")) {
      matched.add(UUID.fromString(item.path("id").asString()));
    }
    assertThat(matched).containsExactly(literal);
  }

  /** An answer line the listing does not contain is refused at authoring time. */
  @Test
  void anAnswerLineOutsideTheListingIsRefused() throws Exception {
    LocalDate day = nextDateBlock();
    String editor = editorToken();

    MvcResult result =
        mockMvc
            .perform(
                post("/api/v1/admin/puzzles")
                    .header(HttpHeaders.AUTHORIZATION, bearer(editor))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        jsonMapper.writeValueAsString(
                            new CreatePuzzleRequest(
                                day,
                                "Past the end",
                                null,
                                "java",
                                CODE,
                                CODE_LINES + 1,
                                EXPLANATION))))
            .andReturn();
    assertThat(result.getResponse().getStatus()).isEqualTo(422);
    assertThat(errorCode(result)).isEqualTo("PUZZLE_LINE_OUT_OF_RANGE");
  }

  // ---- The answer is not in the question -------------------------------------------------------

  /**
   * The player's view withholds the answer line and the explanation until the attempt is spent, and
   * hands both over the moment it is.
   *
   * <p>Asserted on the wire rather than on a service return value: the field that must not be there
   * is one a serializer could reintroduce without any code changing shape.
   */
  @Test
  void todayWithholdsTheAnswerUntilTheAttemptIsSpent() throws Exception {
    LocalDate day = nextDateBlock();
    clock.set(middayOn(day));
    String editor = editorToken();
    String admin = adminToken();
    UUID puzzleId = publishPuzzle(editor, admin, day, "Hidden answer");
    Player player = newPlayer();

    MvcResult before = mockMvc.perform(todayRequest(player.token())).andReturn();
    assertThat(before.getResponse().getStatus()).isEqualTo(200);
    JsonNode question = json(before);
    assertThat(question.path("id").asString()).isEqualTo(puzzleId.toString());
    assertThat(question.path("puzzle_date").asString()).isEqualTo(day.toString());
    assertThat(question.path("line_count").asInt()).isEqualTo(CODE_LINES);
    assertThat(question.path("attempted").asBoolean()).isFalse();
    assertThat(question.path("buggy_line").isNull()).isTrue();
    assertThat(question.path("explanation_markdown").isNull()).isTrue();
    assertThat(question.path("attempt").isNull()).isTrue();
    // The listing itself must reach the player intact -- the answer being hidden is not an excuse
    // for shipping something they cannot read.
    assertThat(question.path("code").asString()).isEqualTo(CODE);

    MvcResult wrong = mockMvc.perform(attemptRequest(player.token(), 4, 9_000)).andReturn();
    assertThat(wrong.getResponse().getStatus()).isEqualTo(200);
    JsonNode verdict = json(wrong);
    assertThat(verdict.path("correct").asBoolean()).isFalse();
    assertThat(verdict.path("buggy_line").asInt()).isEqualTo(BUGGY_LINE);
    assertThat(verdict.path("explanation_markdown").asString()).isEqualTo(EXPLANATION);
    // A wrong answer is still an answer: nothing about the streak changes, and it does not start
    // one.
    assertThat(verdict.path("current_streak").asInt()).isZero();

    MvcResult after = mockMvc.perform(todayRequest(player.token())).andReturn();
    JsonNode answered = json(after);
    assertThat(answered.path("attempted").asBoolean()).isTrue();
    assertThat(answered.path("buggy_line").asInt()).isEqualTo(BUGGY_LINE);
    assertThat(answered.path("explanation_markdown").asString()).isEqualTo(EXPLANATION);
    assertThat(answered.path("attempt").path("selected_line").asInt()).isEqualTo(4);
    assertThat(answered.path("attempt").path("correct").asBoolean()).isFalse();
    assertThat(answered.path("attempt").path("elapsed_millis").asLong()).isEqualTo(9_000);
  }

  /** One attempt per player per puzzle, enforced for a second request as well as a second guess. */
  @Test
  void aPlayerAnswersAtMostOnce() throws Exception {
    LocalDate day = nextDateBlock();
    clock.set(middayOn(day));
    UUID puzzleId = publishPuzzle(editorToken(), adminToken(), day, "One shot");
    Player player = newPlayer();

    assertThat(
            mockMvc
                .perform(attemptRequest(player.token(), 4, 5_000))
                .andReturn()
                .getResponse()
                .getStatus())
        .isEqualTo(200);

    MvcResult second = mockMvc.perform(attemptRequest(player.token(), BUGGY_LINE, 100)).andReturn();
    assertThat(second.getResponse().getStatus()).isEqualTo(409);
    assertThat(errorCode(second)).isEqualTo("PUZZLE_ALREADY_ATTEMPTED");

    JdbcTemplate jdbc = new JdbcTemplate(dataSource);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM puzzle_attempts WHERE puzzle_id = ? AND user_id = ?",
                Integer.class,
                puzzleId,
                player.id()))
        .isEqualTo(1);
  }

  /** A click on a line the listing does not have is refused before anything is recorded. */
  @Test
  void aClickOutsideTheListingIsRefused() throws Exception {
    LocalDate day = nextDateBlock();
    clock.set(middayOn(day));
    UUID puzzleId = publishPuzzle(editorToken(), adminToken(), day, "Out of range");
    Player player = newPlayer();

    MvcResult result =
        mockMvc.perform(attemptRequest(player.token(), CODE_LINES + 1, 1_000)).andReturn();
    assertThat(result.getResponse().getStatus()).isEqualTo(422);
    assertThat(errorCode(result)).isEqualTo("PUZZLE_LINE_OUT_OF_RANGE");

    JdbcTemplate jdbc = new JdbcTemplate(dataSource);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM puzzle_attempts WHERE puzzle_id = ?",
                Integer.class,
                puzzleId))
        .isZero();
  }

  /** A day with no published puzzle answers with the feature's own code, not a server error. */
  @Test
  void aDayWithNoPuzzleSaysSo() throws Exception {
    clock.set(middayOn(nextDateBlock()));
    Player player = newPlayer();

    MvcResult result = mockMvc.perform(todayRequest(player.token())).andReturn();
    assertThat(result.getResponse().getStatus()).isEqualTo(404);
    assertThat(errorCode(result)).isEqualTo("PUZZLE_NOT_FOUND");
  }

  // ---- Streaks ---------------------------------------------------------------------------------

  /**
   * Four days in one test: solve, solve, miss, solve.
   *
   * <p>The run reaches two, the missed day is never recorded as anything, and the fourth day's
   * correct answer starts again at one while the record of two survives. Nothing runs at midnight
   * to make that true -- the gap between the stored date and the newly solved one is the whole
   * mechanism, which is exactly why this can be checked by moving a clock instead of by waiting.
   */
  @Test
  void aStreakCountsConsecutiveDaysAndRestartsAfterAMissedOne() throws Exception {
    LocalDate dayOne = nextDateBlock();
    clock.set(middayOn(dayOne));

    String editor = editorToken();
    String admin = adminToken();
    publishPuzzle(editor, admin, dayOne, "Day one");
    publishPuzzle(editor, admin, dayOne.plusDays(1), "Day two");
    publishPuzzle(editor, admin, dayOne.plusDays(2), "Day three");
    publishPuzzle(editor, admin, dayOne.plusDays(3), "Day four");

    Player player = newPlayer();

    JsonNode first =
        json(mockMvc.perform(attemptRequest(player.token(), BUGGY_LINE, 4_000)).andReturn());
    assertThat(first.path("correct").asBoolean()).isTrue();
    assertThat(first.path("current_streak").asInt()).isEqualTo(1);
    assertThat(first.path("longest_streak").asInt()).isEqualTo(1);

    clock.set(middayOn(dayOne.plusDays(1)));
    JsonNode second =
        json(mockMvc.perform(attemptRequest(signIn(player), BUGGY_LINE, 3_000)).andReturn());
    assertThat(second.path("current_streak").asInt()).isEqualTo(2);
    assertThat(second.path("longest_streak").asInt()).isEqualTo(2);

    // Day three is never played at all. No request is made, which is the point: a missed day is
    // the absence of an event, not an event of its own.
    clock.set(middayOn(dayOne.plusDays(3)));
    JsonNode fourth =
        json(mockMvc.perform(attemptRequest(signIn(player), BUGGY_LINE, 2_000)).andReturn());
    assertThat(fourth.path("current_streak").asInt()).isEqualTo(1);
    assertThat(fourth.path("longest_streak").asInt()).isEqualTo(2);

    JdbcTemplate jdbc = new JdbcTemplate(dataSource);
    assertThat(
            jdbc.queryForObject(
                    "SELECT last_solved_date FROM user_streaks WHERE user_id = ?",
                    java.sql.Date.class,
                    player.id())
                .toLocalDate())
        .isEqualTo(dayOne.plusDays(3));
  }

  /**
   * A wrong answer does not break a streak by itself -- the missed day does, on the next correct
   * answer, through the same arithmetic.
   *
   * <p>Worth separating from the test above because the two failure modes look identical from the
   * outside and are not: a "break the streak now" branch written into the wrong-answer path would
   * pass that test and fail this one's second assertion, where the streak is expected to be intact
   * immediately after the miss.
   */
  @Test
  void aWrongAnswerDoesNotItselfResetTheStreak() throws Exception {
    LocalDate dayOne = nextDateBlock();
    clock.set(middayOn(dayOne));

    String editor = editorToken();
    String admin = adminToken();
    publishPuzzle(editor, admin, dayOne, "Day one");
    publishPuzzle(editor, admin, dayOne.plusDays(1), "Day two");

    Player player = newPlayer();
    mockMvc.perform(attemptRequest(player.token(), BUGGY_LINE, 4_000)).andReturn();

    clock.set(middayOn(dayOne.plusDays(1)));
    JsonNode wrong = json(mockMvc.perform(attemptRequest(signIn(player), 5, 4_000)).andReturn());
    assertThat(wrong.path("correct").asBoolean()).isFalse();
    // The row is untouched: still one day, still ending on day one.
    assertThat(wrong.path("current_streak").asInt()).isEqualTo(1);
    assertThat(wrong.path("longest_streak").asInt()).isEqualTo(1);

    JdbcTemplate jdbc = new JdbcTemplate(dataSource);
    assertThat(
            jdbc.queryForObject(
                    "SELECT last_solved_date FROM user_streaks WHERE user_id = ?",
                    java.sql.Date.class,
                    player.id())
                .toLocalDate())
        .isEqualTo(dayOne);
  }

  // ---- Scoreboard ------------------------------------------------------------------------------

  /**
   * Both boards, over the same three players, plus the rule that keeps the board worth playing for:
   * only correct answers appear on it.
   */
  @Test
  void theScoreboardOrdersByTimeAndByStreak() throws Exception {
    LocalDate dayOne = nextDateBlock();
    clock.set(middayOn(dayOne));

    String editor = editorToken();
    String admin = adminToken();
    publishPuzzle(editor, admin, dayOne, "Day one");
    publishPuzzle(editor, admin, dayOne.plusDays(1), "Day two");

    // Two of the three play the first day, which is what gives them a streak of two on the second.
    Player steady = newPlayer();
    Player quick = newPlayer();
    Player newcomer = newPlayer();
    mockMvc.perform(attemptRequest(steady.token(), BUGGY_LINE, 30_000)).andReturn();
    mockMvc.perform(attemptRequest(quick.token(), BUGGY_LINE, 30_000)).andReturn();

    clock.set(middayOn(dayOne.plusDays(1)));
    mockMvc.perform(attemptRequest(signIn(steady), BUGGY_LINE, 20_000)).andReturn();
    mockMvc.perform(attemptRequest(signIn(quick), BUGGY_LINE, 5_000)).andReturn();
    mockMvc.perform(attemptRequest(signIn(newcomer), BUGGY_LINE, 1_000)).andReturn();

    // A fourth player answers wrongly on the same day and must not appear at all.
    Player mistaken = newPlayer();
    mockMvc.perform(attemptRequest(mistaken.token(), 5, 500)).andReturn();

    JsonNode byTime = json(mockMvc.perform(leaderboardRequest(signIn(steady), "time")).andReturn());
    assertThat(idsOf(byTime)).containsExactly(newcomer.id(), quick.id(), steady.id());
    assertThat(byTime.path("items").get(0).path("elapsed_millis").asLong()).isEqualTo(1_000);
    assertThat(byTime.path("items").get(0).path("current_streak").asInt()).isEqualTo(1);
    assertThat(byTime.path("total_elements").asLong()).isEqualTo(3);
    // The name shown is the account's local part, never the whole address.
    assertThat(byTime.path("items").get(0).path("display_name").asString()).doesNotContain("@");

    JsonNode byStreak =
        json(mockMvc.perform(leaderboardRequest(signIn(steady), "streak")).andReturn());
    // Two streaks of two, ordered between themselves by time, then the newcomer's streak of one.
    assertThat(idsOf(byStreak)).containsExactly(quick.id(), steady.id(), newcomer.id());
    assertThat(byStreak.path("items").get(0).path("current_streak").asInt()).isEqualTo(2);
    assertThat(byStreak.path("items").get(2).path("current_streak").asInt()).isEqualTo(1);
  }

  /** An unrecognised board is a bad request, not a silent fallback to the other one. */
  @Test
  void anUnknownScoreboardOrderIsRefused() throws Exception {
    LocalDate day = nextDateBlock();
    clock.set(middayOn(day));
    publishPuzzle(editorToken(), adminToken(), day, "Ordering");
    Player player = newPlayer();

    MvcResult result =
        mockMvc.perform(leaderboardRequest(player.token(), "alphabetical")).andReturn();
    assertThat(result.getResponse().getStatus()).isEqualTo(400);
    assertThat(errorCode(result)).isEqualTo("INVALID_PARAMETER");
  }

  // ---- Who may call what -----------------------------------------------------------------------

  /** The player surface is closed to callers with no session at all. */
  @Test
  void thePlayerSurfaceRefusesAnAnonymousCaller() throws Exception {
    assertThat(mockMvc.perform(get("/api/v1/puzzle/today")).andReturn().getResponse().getStatus())
        .isEqualTo(401);
    assertThat(
            mockMvc
                .perform(get("/api/v1/puzzle/today/leaderboard"))
                .andReturn()
                .getResponse()
                .getStatus())
        .isEqualTo(401);
    MvcResult attempt =
        mockMvc
            .perform(
                post("/api/v1/puzzle/today/attempt")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(jsonMapper.writeValueAsString(new PuzzleAttemptRequest(1, 1_000L))))
            .andReturn();
    assertThat(attempt.getResponse().getStatus()).isEqualTo(401);
  }

  /**
   * The authoring surface is closed to ordinary players, and the approval decision is closed to
   * editors -- who may write a puzzle and recommend it, but not decide that everybody sees it.
   */
  @Test
  void theAuthoringSurfaceIsClosedToPlayersAndApprovalIsClosedToEditors() throws Exception {
    LocalDate day = nextDateBlock();
    String editor = editorToken();
    String player = userToken();

    MvcResult listedByPlayer =
        mockMvc
            .perform(get("/api/v1/admin/puzzles").header(HttpHeaders.AUTHORIZATION, bearer(player)))
            .andReturn();
    assertThat(listedByPlayer.getResponse().getStatus()).isEqualTo(403);
    assertThat(errorCode(listedByPlayer)).isEqualTo("FORBIDDEN_ROLE");

    MvcResult createdByPlayer =
        mockMvc
            .perform(
                post("/api/v1/admin/puzzles")
                    .header(HttpHeaders.AUTHORIZATION, bearer(player))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        jsonMapper.writeValueAsString(
                            new CreatePuzzleRequest(
                                day, "Not yours", null, "java", CODE, BUGGY_LINE, EXPLANATION))))
            .andReturn();
    assertThat(createdByPlayer.getResponse().getStatus()).isEqualTo(403);

    UUID puzzleId = createDraft(editor, day, "Editor's own");
    mockMvc.perform(transition(editor, puzzleId, "submit", PuzzleStatus.DRAFT, null)).andReturn();

    MvcResult selfApproved =
        mockMvc
            .perform(transition(editor, puzzleId, "approve", PuzzleStatus.PENDING_REVIEW, null))
            .andReturn();
    assertThat(selfApproved.getResponse().getStatus()).isEqualTo(403);
    assertThat(errorCode(selfApproved)).isEqualTo("FORBIDDEN_ROLE");

    MvcResult selfRejected =
        mockMvc
            .perform(
                transition(
                    editor,
                    puzzleId,
                    "reject",
                    PuzzleStatus.PENDING_REVIEW,
                    "An editor may not decide this either."))
            .andReturn();
    assertThat(selfRejected.getResponse().getStatus()).isEqualTo(403);

    // And it really is still waiting, rather than having slipped through under the refusal.
    MvcResult queue =
        mockMvc
            .perform(
                get("/api/v1/admin/puzzles/review-queue")
                    .header(HttpHeaders.AUTHORIZATION, bearer(editor)))
            .andReturn();
    assertThat(queue.getResponse().getStatus()).isEqualTo(200);
    boolean present = false;
    for (JsonNode item : json(queue).path("items")) {
      if (item.path("id").asString().equals(puzzleId.toString())) {
        present = true;
        assertThat(item.path("status").asString()).isEqualTo("PENDING_REVIEW");
      }
    }
    assertThat(present).isTrue();
  }

  // ---- Fixtures --------------------------------------------------------------------------------

  /** A signed-in player: the account identifier the assertions use, and a current access token. */
  private record Player(UUID id, String email, String token) {}

  private Player newPlayer() throws Exception {
    String email = "puzzle-" + UUID.randomUUID() + "@example.test";
    Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    User user = new User();
    user.setId(UuidV7.randomUuid());
    user.setEmail(email);
    user.setPasswordHash(passwordEncoder.encode(PLAYER_PASSWORD));
    user.setRole(Role.USER);
    user.setLocale(UserLocale.EN);
    user.setTheme(Theme.SYSTEM);
    user.setEnabled(true);
    user.setCreatedAt(now);
    user.setUpdatedAt(now);
    users.save(user);
    createdUserIds.add(user.getId());

    Player player = new Player(user.getId(), email, null);
    return new Player(user.getId(), email, signIn(player));
  }

  /**
   * Signs the player in again at whatever the clock now reads. Access tokens last minutes, so a
   * test that moved the clock on by a day is holding an expired one.
   */
  private String signIn(Player player) throws Exception {
    MvcResult result =
        mockMvc
            .perform(
                post("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        jsonMapper.writeValueAsString(
                            new LoginRequest(
                                player.email(), PLAYER_PASSWORD, "puzzle-it", "BODY"))))
            .andReturn();
    if (result.getResponse().getStatus() != 200) {
      throw new IllegalStateException(
          "Fixture sign-in failed: " + result.getResponse().getContentAsString());
    }
    return jsonMapper
        .readValue(result.getResponse().getContentAsString(), AuthResponse.class)
        .accessToken();
  }

  private UUID createDraft(String editorToken, LocalDate day, String title) throws Exception {
    MvcResult result =
        mockMvc
            .perform(
                post("/api/v1/admin/puzzles")
                    .header(HttpHeaders.AUTHORIZATION, bearer(editorToken))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        jsonMapper.writeValueAsString(
                            new CreatePuzzleRequest(
                                day,
                                title,
                                "Find the line that reads past the end.",
                                "java",
                                CODE,
                                BUGGY_LINE,
                                EXPLANATION))))
            .andReturn();
    if (result.getResponse().getStatus() != 201) {
      throw new IllegalStateException(
          "Fixture puzzle creation failed: " + result.getResponse().getContentAsString());
    }
    UUID id = UUID.fromString(json(result).path("id").asString());
    createdPuzzleIds.add(id);
    return id;
  }

  private UUID publishPuzzle(String editorToken, String adminToken, LocalDate day, String title)
      throws Exception {
    UUID id = createDraft(editorToken, day, title);
    mockMvc.perform(transition(editorToken, id, "submit", PuzzleStatus.DRAFT, null)).andReturn();
    MvcResult approved =
        mockMvc
            .perform(transition(adminToken, id, "approve", PuzzleStatus.PENDING_REVIEW, null))
            .andReturn();
    if (approved.getResponse().getStatus() != 200) {
      throw new IllegalStateException(
          "Fixture approval failed: " + approved.getResponse().getContentAsString());
    }
    return id;
  }

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder transition(
      String token, UUID puzzleId, String action, PuzzleStatus expected, String reason)
      throws Exception {
    return post("/api/v1/admin/puzzles/{id}/{action}", puzzleId, action)
        .header(HttpHeaders.AUTHORIZATION, bearer(token))
        .contentType(MediaType.APPLICATION_JSON)
        .content(jsonMapper.writeValueAsString(new PuzzleTransitionRequest(expected, reason)));
  }

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder todayRequest(
      String token) {
    return get("/api/v1/puzzle/today").header(HttpHeaders.AUTHORIZATION, bearer(token));
  }

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder attemptRequest(
      String token, int selectedLine, long elapsedMillis) throws Exception {
    return post("/api/v1/puzzle/today/attempt")
        .header(HttpHeaders.AUTHORIZATION, bearer(token))
        .contentType(MediaType.APPLICATION_JSON)
        .content(
            jsonMapper.writeValueAsString(new PuzzleAttemptRequest(selectedLine, elapsedMillis)));
  }

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
      leaderboardRequest(String token, String sort) {
    return get("/api/v1/puzzle/today/leaderboard")
        .param("sort", sort)
        .header(HttpHeaders.AUTHORIZATION, bearer(token));
  }

  private static List<UUID> idsOf(JsonNode page) {
    List<UUID> ids = new ArrayList<>();
    for (JsonNode item : page.path("items")) {
      ids.add(UUID.fromString(item.path("user_id").asString()));
    }
    return ids;
  }

  private static String bearer(String token) {
    return "Bearer " + token;
  }

  /** Midday, so that no assertion depends on a fixture landing near a date boundary. */
  private static Instant middayOn(LocalDate date) {
    return date.atTime(LocalTime.NOON).toInstant(ZoneOffset.UTC);
  }

  private static LocalDate nextDateBlock() {
    return DATE_BASE.plusDays(DATE_BLOCK.getAndIncrement() * 10L);
  }
}

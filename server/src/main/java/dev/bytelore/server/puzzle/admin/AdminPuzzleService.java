package dev.bytelore.server.puzzle.admin;

import dev.bytelore.server.common.ApiException;
import dev.bytelore.server.common.ApiFieldError;
import dev.bytelore.server.common.ErrorCode;
import dev.bytelore.server.common.MarkdownSanitizer;
import dev.bytelore.server.common.PageQuery;
import dev.bytelore.server.common.PageResponse;
import dev.bytelore.server.common.TextNormalizer;
import dev.bytelore.server.common.UuidV7;
import dev.bytelore.server.domain.Puzzle;
import dev.bytelore.server.domain.PuzzleAuditLog;
import dev.bytelore.server.domain.PuzzleStatus;
import dev.bytelore.server.domain.PuzzleStep;
import dev.bytelore.server.puzzle.PuzzleAuditor;
import dev.bytelore.server.puzzle.PuzzleCode;
import dev.bytelore.server.puzzle.admin.dto.AdminPuzzleResponse;
import dev.bytelore.server.puzzle.admin.dto.CreatePuzzleRequest;
import dev.bytelore.server.puzzle.admin.dto.PuzzleAuditLogItemResponse;
import dev.bytelore.server.puzzle.admin.dto.PuzzleTransitionRequest;
import dev.bytelore.server.puzzle.admin.dto.UpdatePuzzleRequest;
import dev.bytelore.server.repository.PuzzleAttemptRepository;
import dev.bytelore.server.repository.PuzzleAuditLogRepository;
import dev.bytelore.server.repository.PuzzleRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Authoring, review and lifecycle for the daily puzzle.
 *
 * <p>The state machine is {@code DRAFT -> PENDING_REVIEW -> PUBLISHED}, or {@code PENDING_REVIEW ->
 * REJECTED} with a written reason, from where a revised puzzle may be submitted again. There is no
 * "publish your own" shortcut of the kind a manually written blog post has, and no parameter that
 * produces one: {@link #approve} is the single method in this class that can write {@code
 * PUBLISHED}, it accepts only a puzzle already in {@code PENDING_REVIEW}, and the endpoint it sits
 * behind is restricted to administrators. A puzzle is shown to the whole platform on the day it
 * runs, so the review step is not a formality that a busy author may skip -- it is the only door.
 *
 * <p>Every transition writes a {@link PuzzleAuditLog} row in the same transaction as the change it
 * describes, through {@link PuzzleAuditor}.
 */
@Service
public class AdminPuzzleService {

  private static final Map<String, String> SORT_FIELDS =
      Map.of(
          "puzzle_date", "puzzleDate",
          "created_at", "createdAt",
          "updated_at", "updatedAt",
          "title", "title");
  private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "puzzleDate");
  private static final Sort REVIEW_QUEUE_SORT = Sort.by(Sort.Direction.ASC, "puzzleDate");

  private final PuzzleRepository puzzles;
  private final PuzzleAttemptRepository attempts;
  private final PuzzleAuditLogRepository auditLogs;
  private final PuzzleAuditor auditor;
  private final Clock clock;

  public AdminPuzzleService(
      PuzzleRepository puzzles,
      PuzzleAttemptRepository attempts,
      PuzzleAuditLogRepository auditLogs,
      PuzzleAuditor auditor,
      Clock clock) {
    this.puzzles = puzzles;
    this.attempts = attempts;
    this.auditLogs = auditLogs;
    this.auditor = auditor;
    this.clock = clock;
  }

  @Transactional
  public AdminPuzzleResponse create(CreatePuzzleRequest request, UUID actorUserId) {
    requireDateAvailable(request.puzzleDate(), null);

    String code = normalizeAndValidateCode(request.code());
    PuzzleCode.requireLineWithinCode(request.buggyLine(), code, "buggy_line");

    Instant now = now();
    Puzzle puzzle = new Puzzle();
    puzzle.setId(UuidV7.randomUuid());
    puzzle.setStatus(PuzzleStatus.DRAFT);
    puzzle.setPuzzleDate(request.puzzleDate());
    puzzle.setTitle(normalizeAndValidateTitle(request.title()));
    puzzle.setPromptMarkdown(normalizeAndValidatePrompt(request.promptMarkdown()));
    puzzle.setLanguage(request.language());
    puzzle.setCode(code);
    puzzle.setBuggyLine(request.buggyLine());
    puzzle.setExplanationMarkdown(normalizeAndValidateExplanation(request.explanationMarkdown()));
    puzzle.setCreatedBy(actorUserId);
    puzzle.setPublishedAt(null);
    puzzle.setCreatedAt(now);
    puzzle.setUpdatedAt(now);
    Puzzle saved = puzzles.save(puzzle);

    auditor.record(PuzzleStep.DRAFT, saved.getId(), actorUserId, null, PuzzleStatus.DRAFT, null);
    return toResponse(saved);
  }

  @Transactional(readOnly = true)
  public PageResponse<AdminPuzzleResponse> list(
      Integer page, Integer size, List<String> sort, String status, String query) {
    Pageable pageable = PageQuery.resolve(page, size, sort, SORT_FIELDS, DEFAULT_SORT);
    Page<Puzzle> result = puzzles.search(parseStatus(status), buildTitlePattern(query), pageable);
    return toPage(result);
  }

  /** The review queue: puzzles waiting for a decision, the soonest running day first. */
  @Transactional(readOnly = true)
  public PageResponse<AdminPuzzleResponse> reviewQueue(
      Integer page, Integer size, List<String> sort) {
    Pageable pageable = PageQuery.resolve(page, size, sort, SORT_FIELDS, REVIEW_QUEUE_SORT);
    return toPage(puzzles.findByStatus(PuzzleStatus.PENDING_REVIEW, pageable));
  }

  @Transactional(readOnly = true)
  public AdminPuzzleResponse get(UUID id) {
    return toResponse(requirePuzzle(id));
  }

  /**
   * Edits a puzzle that has not been published yet.
   *
   * <p>A puzzle waiting for a decision is not editable in place. A reviewer approves the listing
   * they read, and an edit that left the row in {@code PENDING_REVIEW} would let a different
   * listing -- possibly a different answer line -- be approved than the one that was reviewed, with
   * nothing in the trail to show it. So a content change made while the puzzle is in review sends
   * it back to {@code DRAFT} and records that as a transition of its own: the author resubmits, and
   * the reviewer decides again on what they can actually see.
   */
  @Transactional
  public AdminPuzzleResponse update(UUID id, UpdatePuzzleRequest request, UUID actorUserId) {
    Puzzle puzzle = requirePuzzle(id);
    requireVersion(puzzle.getVersion(), request.version());

    if (puzzle.getStatus() == PuzzleStatus.PUBLISHED) {
      // Players are answering this listing right now, and some have already spent their one
      // attempt on it. Moving the answer line under them would invalidate attempts that are
      // already recorded and cannot be replayed.
      throw new ApiException(
          ErrorCode.PUZZLE_NOT_EDITABLE,
          "A published puzzle is frozen; correct it by publishing a different one.");
    }

    boolean changed = false;
    if (request.puzzleDate() != null && !request.puzzleDate().equals(puzzle.getPuzzleDate())) {
      requireDateAvailable(request.puzzleDate(), puzzle.getId());
      puzzle.setPuzzleDate(request.puzzleDate());
      changed = true;
    }
    if (request.title() != null) {
      puzzle.setTitle(normalizeAndValidateTitle(request.title()));
      changed = true;
    }
    if (request.promptMarkdown() != null) {
      puzzle.setPromptMarkdown(normalizeAndValidatePrompt(request.promptMarkdown()));
      changed = true;
    }
    if (request.language() != null) {
      puzzle.setLanguage(request.language());
      changed = true;
    }
    if (request.code() != null) {
      puzzle.setCode(normalizeAndValidateCode(request.code()));
      changed = true;
    }
    if (request.buggyLine() != null) {
      puzzle.setBuggyLine(request.buggyLine());
      changed = true;
    }
    if (request.explanationMarkdown() != null) {
      puzzle.setExplanationMarkdown(normalizeAndValidateExplanation(request.explanationMarkdown()));
      changed = true;
    }

    // Re-checked against whichever of the two the request changed, rather than only when the line
    // itself moved: a shorter listing can put a line that was valid a moment ago past the end.
    PuzzleCode.requireLineWithinCode(puzzle.getBuggyLine(), puzzle.getCode(), "buggy_line");

    if (changed) {
      if (puzzle.getStatus() == PuzzleStatus.PENDING_REVIEW) {
        // Back to the author's desk, audited. `publishedAt` is left alone deliberately: a puzzle
        // in review has never been published, so there is nothing there to clear.
        puzzle.setStatus(PuzzleStatus.DRAFT);
        auditor.record(
            PuzzleStep.DRAFT,
            puzzle.getId(),
            actorUserId,
            PuzzleStatus.PENDING_REVIEW,
            PuzzleStatus.DRAFT,
            null);
      }
      puzzle.setUpdatedAt(now());
    }
    return toResponse(puzzles.save(puzzle));
  }

  @Transactional
  public void delete(UUID id) {
    Puzzle puzzle = requirePuzzle(id);
    if (puzzle.getStatus() == PuzzleStatus.PUBLISHED) {
      throw new ApiException(
          ErrorCode.PUBLISHED_DELETE_BLOCKED,
          "A published puzzle cannot be deleted; people have already played it.");
    }
    // Neither foreign key is ON DELETE CASCADE: the audit trail is append-only and an attempt is
    // somebody's record of having played. Both are cleared here, explicitly, because a puzzle that
    // was never published has no audience whose history either could still describe.
    attempts.deleteByPuzzleId(id);
    auditLogs.deleteByPuzzleId(id);
    puzzles.delete(puzzle);
  }

  @Transactional
  public AdminPuzzleResponse submit(UUID id, PuzzleTransitionRequest request, UUID actorUserId) {
    Puzzle puzzle = requirePuzzle(id);
    requireTransition(
        puzzle, Set.of(PuzzleStatus.DRAFT, PuzzleStatus.REJECTED), request.expectedStatus());
    // A rejected puzzle's date was released when it was rejected, and somebody else may have taken
    // it since. Submitting brings this row back among the live ones, so the day has to be free
    // again -- checked here rather than left to the partial unique index, so the answer names the
    // conflict instead of arriving as a generic constraint failure.
    requireDateAvailable(puzzle.getPuzzleDate(), puzzle.getId());

    PuzzleStatus from = puzzle.getStatus();
    puzzle.setStatus(PuzzleStatus.PENDING_REVIEW);
    puzzle.setUpdatedAt(now());
    puzzles.save(puzzle);
    auditor.record(
        PuzzleStep.SUBMIT,
        puzzle.getId(),
        actorUserId,
        from,
        PuzzleStatus.PENDING_REVIEW,
        request.reason());
    return toResponse(puzzle);
  }

  /**
   * {@code PENDING_REVIEW -> PUBLISHED}. The only method that writes {@code PUBLISHED}.
   *
   * <p>The set of statuses it accepts is a single literal and there is no flag, role or parameter
   * that widens it, so a puzzle that never went through review has no path to the public at all --
   * a property of the shape of this method rather than of anybody remembering to call it correctly.
   */
  @Transactional
  public AdminPuzzleResponse approve(UUID id, PuzzleTransitionRequest request, UUID actorUserId) {
    Puzzle puzzle = requirePuzzle(id);
    requireTransition(puzzle, Set.of(PuzzleStatus.PENDING_REVIEW), request.expectedStatus());

    PuzzleStatus from = puzzle.getStatus();
    Instant now = now();
    puzzle.setStatus(PuzzleStatus.PUBLISHED);
    puzzle.setPublishedAt(now);
    puzzle.setUpdatedAt(now);
    puzzles.save(puzzle);
    auditor.record(
        PuzzleStep.APPROVE,
        puzzle.getId(),
        actorUserId,
        from,
        PuzzleStatus.PUBLISHED,
        request.reason());
    return toResponse(puzzle);
  }

  @Transactional
  public AdminPuzzleResponse reject(UUID id, PuzzleTransitionRequest request, UUID actorUserId) {
    requireReason(request.reason());
    Puzzle puzzle = requirePuzzle(id);
    requireTransition(puzzle, Set.of(PuzzleStatus.PENDING_REVIEW), request.expectedStatus());

    PuzzleStatus from = puzzle.getStatus();
    puzzle.setStatus(PuzzleStatus.REJECTED);
    puzzle.setUpdatedAt(now());
    puzzles.save(puzzle);
    auditor.record(
        PuzzleStep.REJECT,
        puzzle.getId(),
        actorUserId,
        from,
        PuzzleStatus.REJECTED,
        request.reason());
    return toResponse(puzzle);
  }

  @Transactional(readOnly = true)
  public PageResponse<PuzzleAuditLogItemResponse> auditLog(UUID id, Integer page, Integer size) {
    requirePuzzle(id);
    Pageable pageable =
        PageQuery.resolve(page, size, null, Map.of(), Sort.by(Sort.Direction.ASC, "occurredAt"));
    Page<PuzzleAuditLog> result = auditLogs.findByPuzzleId(id, pageable);
    List<PuzzleAuditLogItemResponse> items =
        result.getContent().stream()
            .map(
                log ->
                    new PuzzleAuditLogItemResponse(
                        log.getId(),
                        log.getStep(),
                        log.getActorUserId(),
                        log.getFromStatus(),
                        log.getToStatus(),
                        log.getReason(),
                        log.getOccurredAt()))
            .toList();
    return PageResponse.of(items, result.getNumber(), result.getSize(), result.getTotalElements());
  }

  // ---- Internals ------------------------------------------------------------------------------

  private void requireDateAvailable(LocalDate date, UUID selfId) {
    Optional<Puzzle> holder = puzzles.findActiveByPuzzleDate(date);
    if (holder.isPresent() && !holder.get().getId().equals(selfId)) {
      throw new ApiException(
          ErrorCode.PUZZLE_DATE_ALREADY_TAKEN,
          "Another puzzle already runs on %s.".formatted(date));
    }
  }

  private static void requireTransition(
      Puzzle puzzle, Set<PuzzleStatus> allowedFrom, PuzzleStatus expected) {
    if (puzzle.getStatus() != expected || !allowedFrom.contains(puzzle.getStatus())) {
      throw new ApiException(
          ErrorCode.INVALID_STATE_TRANSITION,
          "Puzzle '%s' is '%s', not '%s', or this transition is not legal from that status."
              .formatted(puzzle.getId(), puzzle.getStatus(), expected));
    }
  }

  /**
   * Normalizes a listing and admits it, or refuses the write.
   *
   * <p>Line endings are converted to LF and a byte order mark is dropped; nothing else is touched.
   * Unicode composition is deliberately not applied, because in a source listing the author's exact
   * characters are the content. The LF conversion is what keeps a line number meaning the same
   * thing to the author who wrote it and to the player who counts down to it.
   */
  private static String normalizeAndValidateCode(String rawCode) {
    String normalized = TextNormalizer.normalizeCode(rawCode);
    if (normalized == null || normalized.isBlank()) {
      throw new ApiException(
          ErrorCode.VALIDATION_FAILED,
          "'code' must not be blank.",
          List.of(new ApiFieldError("code", "REQUIRED", "must not be blank")));
    }
    return normalized;
  }

  private static String normalizeAndValidateTitle(String rawTitle) {
    String normalized = TextNormalizer.normalize(rawTitle);
    if (normalized == null || normalized.isBlank()) {
      throw new ApiException(
          ErrorCode.VALIDATION_FAILED,
          "'title' must not be blank.",
          List.of(new ApiFieldError("title", "REQUIRED", "must not be blank")));
    }
    MarkdownSanitizer.validatePlainText(normalized, "title");
    return normalized;
  }

  private static String normalizeAndValidatePrompt(String rawPrompt) {
    String normalized = TextNormalizer.normalize(rawPrompt);
    if (normalized == null || normalized.isBlank()) {
      return null;
    }
    MarkdownSanitizer.validateMarkdown(normalized, "prompt_markdown");
    return normalized;
  }

  private static String normalizeAndValidateExplanation(String rawExplanation) {
    String normalized = TextNormalizer.normalize(rawExplanation);
    if (normalized == null || normalized.isBlank()) {
      throw new ApiException(
          ErrorCode.VALIDATION_FAILED,
          "'explanation_markdown' must not be blank.",
          List.of(new ApiFieldError("explanation_markdown", "REQUIRED", "must not be blank")));
    }
    MarkdownSanitizer.validateMarkdown(normalized, "explanation_markdown");
    return normalized;
  }

  private static void requireReason(String reason) {
    if (reason == null || reason.trim().length() < 10) {
      throw new ApiException(
          ErrorCode.VALIDATION_FAILED,
          "'reason' is required and must be at least 10 characters for this transition.",
          List.of(new ApiFieldError("reason", "SIZE", "must be at least 10 characters")));
    }
  }

  private static void requireVersion(long actual, long expected) {
    if (actual != expected) {
      throw new ApiException(
          ErrorCode.VERSION_CONFLICT,
          "The resource was modified concurrently; re-read it and retry.");
    }
  }

  /**
   * Builds the {@code LIKE} pattern for the title filter. A blank search term becomes {@code "%"},
   * which matches every title, so the query always receives a non-null pattern.
   *
   * <p>Everything the caller typed is a literal. {@code %}, {@code _} and the escape character
   * itself are neutralised before the surrounding wildcards are added, so a search for {@code
   * "100%"} finds the titles containing that text rather than every title containing {@code "100"};
   * the query names the same escape character in its {@code ESCAPE} clause. The escape character is
   * doubled first -- doing it after would escape the backslashes this method just introduced.
   */
  private static String buildTitlePattern(String query) {
    if (query == null || query.isBlank()) {
      return "%";
    }
    String literal = query.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    return "%" + literal + "%";
  }

  private static PuzzleStatus parseStatus(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    try {
      return PuzzleStatus.valueOf(value);
    } catch (IllegalArgumentException e) {
      throw new ApiException(
          ErrorCode.INVALID_PARAMETER, "'status' has an unrecognised value '%s'.".formatted(value));
    }
  }

  private PageResponse<AdminPuzzleResponse> toPage(Page<Puzzle> result) {
    List<AdminPuzzleResponse> items =
        result.getContent().stream().map(AdminPuzzleService::toResponse).toList();
    return PageResponse.of(items, result.getNumber(), result.getSize(), result.getTotalElements());
  }

  private static AdminPuzzleResponse toResponse(Puzzle puzzle) {
    return new AdminPuzzleResponse(
        puzzle.getId(),
        puzzle.getStatus(),
        puzzle.getPuzzleDate(),
        puzzle.getTitle(),
        puzzle.getPromptMarkdown(),
        puzzle.getLanguage(),
        puzzle.getCode(),
        PuzzleCode.lineCount(puzzle.getCode()),
        puzzle.getBuggyLine(),
        puzzle.getExplanationMarkdown(),
        puzzle.getCreatedBy(),
        puzzle.getPublishedAt(),
        puzzle.getCreatedAt(),
        puzzle.getUpdatedAt(),
        puzzle.getVersion());
  }

  private Puzzle requirePuzzle(UUID id) {
    return puzzles
        .findById(id)
        .orElseThrow(
            () ->
                new ApiException(
                    ErrorCode.PUZZLE_NOT_FOUND, "No puzzle exists with id '%s'.".formatted(id)));
  }

  private Instant now() {
    return Instant.now(clock).truncatedTo(ChronoUnit.MILLIS);
  }
}

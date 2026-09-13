package dev.bytelore.server.puzzle.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * {@code GET /puzzle/today}.
 *
 * <p>{@code buggyLine} and {@code explanationMarkdown} are null until the caller has answered. They
 * are left out of the projection rather than blanked afterwards, so the answer is never loaded into
 * a response object that something later might serialize by accident: a puzzle whose answer travels
 * with the question is not a puzzle.
 *
 * @param lineCount the number of lines in {@code code}, so a client renders the same gutter the
 *     server validates a click against
 * @param attempt the caller's own answer, or null if they have not answered yet
 */
public record TodayPuzzleResponse(
    UUID id,
    LocalDate puzzleDate,
    String title,
    String promptMarkdown,
    String language,
    String code,
    int lineCount,
    boolean attempted,
    Integer buggyLine,
    String explanationMarkdown,
    PuzzleAttemptSummary attempt) {

  /** The question only: no answer line, no explanation. */
  public static TodayPuzzleResponse unanswered(
      UUID id,
      LocalDate puzzleDate,
      String title,
      String promptMarkdown,
      String language,
      String code,
      int lineCount) {
    return new TodayPuzzleResponse(
        id, puzzleDate, title, promptMarkdown, language, code, lineCount, false, null, null, null);
  }

  /** The question, the caller's own answer, and -- now that they have spent it -- the solution. */
  public static TodayPuzzleResponse answered(
      UUID id,
      LocalDate puzzleDate,
      String title,
      String promptMarkdown,
      String language,
      String code,
      int lineCount,
      int buggyLine,
      String explanationMarkdown,
      PuzzleAttemptSummary attempt) {
    return new TodayPuzzleResponse(
        id,
        puzzleDate,
        title,
        promptMarkdown,
        language,
        code,
        lineCount,
        true,
        buggyLine,
        explanationMarkdown,
        attempt);
  }
}

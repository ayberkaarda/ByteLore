package dev.bytelore.server.puzzle;

import dev.bytelore.server.common.ApiException;
import dev.bytelore.server.common.ErrorCode;

/**
 * Counts the lines of a puzzle listing.
 *
 * <p>One implementation, used by the author-side validation of the answer line and by the
 * player-side validation of the clicked line alike. Two counts that could disagree would let an
 * author save an answer on a line a player is not allowed to pick, which is an unsolvable puzzle
 * that nothing would have refused.
 */
public final class PuzzleCode {

  private PuzzleCode() {}

  /**
   * The number of one-based lines in {@code code}, after line-ending normalization.
   *
   * <p>A trailing newline does not add a line: a listing ending in {@code "\n"} has as many lines
   * as the text before that newline, which is how an editor numbers it and therefore how a player
   * sees it.
   */
  public static int lineCount(String code) {
    if (code == null || code.isEmpty()) {
      return 0;
    }
    int lines = 1;
    for (int i = 0; i < code.length(); i++) {
      if (code.charAt(i) == '\n') {
        lines++;
      }
    }
    // A final newline terminates the last line rather than opening an empty one.
    if (code.charAt(code.length() - 1) == '\n') {
      lines--;
    }
    return lines;
  }

  /**
   * Refuses a one-based line number that {@code code} does not contain.
   *
   * @param field the request field being checked, named in the message so the caller knows whether
   *     the rejected number was the answer they wrote or the line they clicked
   */
  public static void requireLineWithinCode(int line, String code, String field) {
    int lineCount = lineCount(code);
    if (line < 1 || line > lineCount) {
      throw new ApiException(
          ErrorCode.PUZZLE_LINE_OUT_OF_RANGE,
          "'%s' is %d, but the listing has %d line(s).".formatted(field, line, lineCount));
    }
  }
}

package dev.bytelore.server.puzzle;

import dev.bytelore.server.auth.AccessTokenClaims;
import dev.bytelore.server.common.PageResponse;
import dev.bytelore.server.puzzle.dto.LeaderboardEntryResponse;
import dev.bytelore.server.puzzle.dto.PuzzleAttemptRequest;
import dev.bytelore.server.puzzle.dto.PuzzleAttemptResponse;
import dev.bytelore.server.puzzle.dto.TodayPuzzleResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /puzzle} -- the player's side of the daily bug hunt.
 *
 * <p>Every endpoint here needs a signed-in caller and no particular role: this is the surface a
 * reader plays on, not one an editor administers. The requirement is met by the catch-all rule in
 * the security configuration ("anything not listed is authenticated"), so nothing has to be added
 * there to protect these paths -- and nothing added there later can accidentally open them.
 *
 * <p>Unlike the rest of the reading experience, this feature does not work offline and says so by
 * design: a shared daily puzzle with a scoreboard and a streak is a claim about when something
 * happened relative to other people, which a client cannot settle on its own.
 */
@RestController
@RequestMapping("/api/v1/puzzle")
public class PuzzleController {

  private final PuzzleService service;

  public PuzzleController(PuzzleService service) {
    this.service = service;
  }

  @GetMapping("/today")
  public TodayPuzzleResponse today(@AuthenticationPrincipal AccessTokenClaims caller) {
    return service.today(caller.userId());
  }

  @PostMapping("/today/attempt")
  public PuzzleAttemptResponse attempt(
      @AuthenticationPrincipal AccessTokenClaims caller,
      @Valid @RequestBody PuzzleAttemptRequest request) {
    return service.attempt(caller.userId(), request);
  }

  @GetMapping("/today/leaderboard")
  public PageResponse<LeaderboardEntryResponse> leaderboard(
      @RequestParam(required = false) String sort,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size) {
    return service.leaderboard(sort, page, size);
  }
}

package dev.bytelore.server.puzzle;

import java.util.Locale;

/**
 * Derives the name a player is shown under on a scoreboard.
 *
 * <p>An account carries no separate display name, so the address it was registered with is the only
 * thing available. Only the local part travels: the scoreboard is visible to every signed-in
 * player, and publishing whole addresses there would turn a game into an address list for anyone
 * who opened it. Dropping the domain keeps the board readable without handing out something
 * deliverable.
 *
 * <p>This is a stopgap, and a visible one. A real display name -- chosen by the person, changeable
 * by them, and not derived from a credential -- is what this should become.
 */
final class PlayerName {

  private PlayerName() {}

  static String fromEmail(String email) {
    if (email == null || email.isBlank()) {
      return "player";
    }
    int at = email.indexOf('@');
    String local = at > 0 ? email.substring(0, at) : email;
    String trimmed = local.trim().toLowerCase(Locale.ROOT);
    return trimmed.isEmpty() ? "player" : trimmed;
  }
}

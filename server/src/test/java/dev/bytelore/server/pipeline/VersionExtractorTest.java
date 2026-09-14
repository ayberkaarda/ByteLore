package dev.bytelore.server.pipeline;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * A pure unit test for {@link VersionExtractor}, in particular the regression this phase fixes: a
 * pre-release suffix attached to the numeric core with no separator at all used to be silently cut
 * off, which meant a build like {@code "3.15.0b2"} was extracted as plain {@code "3.15.0"} and
 * could then be wrongly confirmed as the stable release it is only a preview of, since {@code
 * "3.15.0"} is a genuine substring of most verify-endpoint responses that actually announce {@code
 * "3.15.0b2"}.
 */
class VersionExtractorTest {

  private static Optional<String> extractFromTitle(String title) {
    return VersionExtractor.extract(
        new FeedItem("tag:x", title, "https://example.test/x", "body", null));
  }

  @Test
  void extractsAPlainDottedVersionFromATitle() {
    assertThat(extractFromTitle("v20.1.0")).contains("v20.1.0");
    assertThat(extractFromTitle("4.1.1")).contains("4.1.1");
  }

  @Test
  void extractsASeparatedPreReleaseSuffixWhole() {
    assertThat(extractFromTitle("v12.0.0-rc1")).contains("v12.0.0-rc1");
    assertThat(extractFromTitle("2.1.0+14")).contains("2.1.0+14");
  }

  /**
   * The regression case: before the fix, {@code VersionExtractor} stopped at the numeric core and
   * returned {@code "3.15.0"}, silently dropping {@code "b2"}. Fixed, the whole thing is captured.
   */
  @Test
  void extractsABareLetterSuffixWithNoSeparatorInsteadOfSilentlyTruncatingIt() {
    assertThat(extractFromTitle("3.15.0b2")).contains("3.15.0b2");
    assertThat(extractFromTitle("Release rc1")).isEmpty(); // no digit at all: nothing to extract
    assertThat(extractFromTitle("Now shipping 1.2.3rc4 today")).contains("1.2.3rc4");
  }

  @Test
  void fallsBackToTheFeedIdWhenTheTitleHasNoVersionShape() {
    Optional<String> result =
        VersionExtractor.extract(
            new FeedItem("tag:v9.9.9", "Announcement", "https://example.test/x", "body", null));
    assertThat(result).contains("v9.9.9");
  }

  @Test
  void aTitleWithNoVersionShapeAtAllYieldsNothing() {
    assertThat(extractFromTitle("Announcing our new logo")).isEmpty();
  }

  // ---- isPreRelease -------------------------------------------------------------------------

  @Test
  void aBareNumericCoreIsNotAPreRelease() {
    assertThat(VersionExtractor.isPreRelease("4.1.1")).isFalse();
    assertThat(VersionExtractor.isPreRelease("v20.1.0")).isFalse();
    assertThat(VersionExtractor.isPreRelease("1.2")).isFalse();
  }

  @Test
  void aSeparatedSuffixIsAPreRelease() {
    assertThat(VersionExtractor.isPreRelease("v12.0.0-rc1")).isTrue();
    assertThat(VersionExtractor.isPreRelease("2.1.0-beta.1")).isTrue();
    assertThat(VersionExtractor.isPreRelease("1.0.0-M1")).isTrue();
    assertThat(VersionExtractor.isPreRelease("2.1.0+14")).isTrue();
  }

  @Test
  void aBareLetterSuffixWithNoSeparatorIsAPreRelease() {
    assertThat(VersionExtractor.isPreRelease("3.15.0b2")).isTrue();
    assertThat(VersionExtractor.isPreRelease("1.2.3rc4")).isTrue();
  }

  @Test
  void nullIsNotAPreRelease() {
    assertThat(VersionExtractor.isPreRelease(null)).isFalse();
  }

  @Test
  void aStringWithNoNumericCoreAtAllIsNotAPreRelease() {
    // NUMERIC_CORE.find() itself returns false here, short-circuiting before the length
    // comparison -- distinct from the "core found, nothing trails it" case above.
    assertThat(VersionExtractor.isPreRelease("no-digits-here")).isFalse();
  }

  // ---- extract() with a null title and/or id ------------------------------------------------

  @Test
  void aNullTitleFallsThroughToTheFeedIdWithoutThrowing() {
    Optional<String> result =
        VersionExtractor.extract(
            new FeedItem("tag:v3.3.3", null, "https://example.test/x", "b", null));
    assertThat(result).contains("v3.3.3");
  }

  @Test
  void aNullTitleAndNullIdYieldsNothing() {
    Optional<String> result =
        VersionExtractor.extract(new FeedItem(null, null, "https://example.test/x", "b", null));
    assertThat(result).isEmpty();
  }

  /**
   * {@code VERSION_SHAPE} allows a suffix of arbitrary length after the numeric core, but {@code
   * ALLOWED_CHARS} caps the whole candidate at 64 characters -- the same bound {@link
   * VersionConfirmationService} re-checks independently before ever placing a version string in a
   * URL. A candidate that satisfies the shape but exceeds that bound is refused here, not passed
   * through.
   */
  @Test
  void aCandidateLongerThanTheAllowedLengthIsRejectedEvenThoughItMatchesTheShape() {
    String overlongSuffix = "a".repeat(80);
    String title = "1.0.0-" + overlongSuffix;
    assertThat(extractFromTitle(title)).isEmpty();
  }
}

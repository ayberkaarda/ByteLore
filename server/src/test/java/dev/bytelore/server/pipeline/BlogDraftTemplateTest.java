package dev.bytelore.server.pipeline;

import static org.assertj.core.api.Assertions.assertThat;

import dev.bytelore.server.common.UuidV7;
import dev.bytelore.server.domain.WhitelistSource;
import org.junit.jupiter.api.Test;

/**
 * A pure unit test for {@link BlogDraftTemplate}: no Spring context, no database, no network --
 * exactly what a "builds text, does not persist anything" helper should be testable with.
 */
class BlogDraftTemplateTest {

  private static WhitelistSource source(String name) {
    WhitelistSource source = new WhitelistSource();
    source.setId(UuidV7.randomUuid());
    source.setName(name);
    return source;
  }

  @Test
  void buildAssemblesTheTitleSlugBodyAndSourceUrlFromTheItem() {
    FeedItem item =
        new FeedItem(
            "tag:1", "v2.0.0", "https://example.test/release/2.0.0", "A short release note.", null);

    BlogDraftTemplate.DraftContent draft =
        BlogDraftTemplate.build(source("Widgets"), item, "2.0.0");

    assertThat(draft.title()).isEqualTo("Widgets 2.0.0 Released");
    assertThat(draft.slugBase()).isEqualTo("widgets-2-0-0");
    assertThat(draft.sourceUrl()).isEqualTo("https://example.test/release/2.0.0");
    assertThat(draft.bodyMarkdown())
        .contains("Widgets has released **2.0.0**")
        .contains("## Highlights")
        .contains("A short release note.")
        .contains("[View the original announcement](https://example.test/release/2.0.0)");
  }

  /**
   * A degenerate slug candidate -- a source name and version with no alphanumeric character between
   * them at all -- collapses to a single run of hyphens, which {@link BlogDraftTemplate#build} then
   * trims down to nothing; {@code slugify} falls back to the literal {@code "release"} rather than
   * handing the caller a blank slug base.
   */
  @Test
  void slugifyFallsBackToReleaseWhenTheCandidateHasNoAlphanumericCharacters() {
    FeedItem item = new FeedItem("tag:2", "***", "https://example.test/release/x", "body", null);

    BlogDraftTemplate.DraftContent draft = BlogDraftTemplate.build(source("!!!"), item, "+++");

    assertThat(draft.slugBase()).isEqualTo("release");
  }

  @Test
  void excerptFallsBackToADefaultMessageWhenContentIsNull() {
    FeedItem item = new FeedItem("tag:3", "v1.0.0", "https://example.test/r", null, null);

    BlogDraftTemplate.DraftContent draft =
        BlogDraftTemplate.build(source("Widgets"), item, "1.0.0");

    assertThat(draft.bodyMarkdown())
        .contains("No further details were included with this release.");
  }

  @Test
  void excerptFallsBackToADefaultMessageWhenContentIsBlank() {
    FeedItem item = new FeedItem("tag:4", "v1.0.0", "https://example.test/r", "   ", null);

    BlogDraftTemplate.DraftContent draft =
        BlogDraftTemplate.build(source("Widgets"), item, "1.0.0");

    assertThat(draft.bodyMarkdown())
        .contains("No further details were included with this release.");
  }

  /**
   * Content that is not blank on its own but sanitizes down to nothing -- a script tag with no
   * surrounding text -- takes the same fallback path as null/blank content, rather than embedding
   * an empty highlights section.
   */
  @Test
  void excerptFallsBackToADefaultMessageWhenContentSanitizesToNothing() {
    FeedItem item =
        new FeedItem(
            "tag:5", "v1.0.0", "https://example.test/r", "<script>alert(1)</script>", null);

    BlogDraftTemplate.DraftContent draft =
        BlogDraftTemplate.build(source("Widgets"), item, "1.0.0");

    assertThat(draft.bodyMarkdown())
        .contains("No further details were included with this release.");
  }

  @Test
  void excerptTruncatesContentLongerThanTheMaximumAndAppendsAnEllipsis() {
    String longContent = "word ".repeat(300); // Comfortably over the 800-char excerpt cap.
    FeedItem item = new FeedItem("tag:6", "v1.0.0", "https://example.test/r", longContent, null);

    BlogDraftTemplate.DraftContent draft =
        BlogDraftTemplate.build(source("Widgets"), item, "1.0.0");

    assertThat(draft.bodyMarkdown()).contains("...");
    // The body is not simply the entire (huge) source content verbatim.
    assertThat(draft.bodyMarkdown().length()).isLessThan(longContent.length());
  }
}

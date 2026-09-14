package dev.bytelore.server.pipeline;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * A pure unit test for {@link FeedParser}. The existing end-to-end coverage ({@code
 * BlogPipelineIT}) only ever feeds it Atom XML, so this class fills in the RSS half of the parser
 * (its {@code <rss>/<channel>/<item>} branch, the plain-text {@code <link>} fallback Atom never
 * needs, and the RFC-1123 {@code pubDate} format RSS uses in place of Atom's ISO timestamps), plus
 * the malformed-input paths that a hostile or broken feed can take.
 */
class FeedParserTest {

  @Test
  void nullInputYieldsAnEmptyListWithoutThrowing() {
    assertThat(FeedParser.parse(null)).isEmpty();
  }

  @Test
  void blankInputYieldsAnEmptyList() {
    assertThat(FeedParser.parse("   ")).isEmpty();
  }

  @Test
  void notWellFormedXmlYieldsAnEmptyListRatherThanThrowing() {
    assertThat(FeedParser.parse("this is not xml at all { garbage </>")).isEmpty();
  }

  @Test
  void anUnrecognisedRootElementYieldsAnEmptyList() {
    assertThat(FeedParser.parse("<foo><bar>hello</bar></foo>")).isEmpty();
  }

  @Test
  void aDoctypeDeclarationIsRefusedOutrightRatherThanBeingExpanded() {
    String xxe =
        """
        <?xml version="1.0"?>
        <!DOCTYPE feed [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
        <feed><entry><title>&xxe;</title></entry></feed>
        """;

    assertThat(FeedParser.parse(xxe)).isEmpty();
  }

  @Test
  void anRssFeedWithARssRootElementIsParsed() {
    String rss =
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Fixture RSS Feed</title>
            <item>
              <guid>tag:rss-1</guid>
              <title>v3.0.0</title>
              <link>https://example.test/release/3.0.0</link>
              <description>An RSS release note, plain text link and all.</description>
              <pubDate>Wed, 02 Oct 2024 15:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>
        """;

    List<FeedItem> items = FeedParser.parse(rss);

    assertThat(items).hasSize(1);
    FeedItem item = items.get(0);
    // id falls back from the absent <id> to <guid>.
    assertThat(item.id()).isEqualTo("tag:rss-1");
    assertThat(item.title()).isEqualTo("v3.0.0");
    // The RSS <link> style -- plain text content, no href attribute -- is the fallback branch
    // Atom's href-attribute link never exercises.
    assertThat(item.link()).isEqualTo("https://example.test/release/3.0.0");
    // content falls back from the absent <content>/<summary> to <description>.
    assertThat(item.content()).isEqualTo("An RSS release note, plain text link and all.");
    // pubDate is RFC-1123, not ISO-8601 -- the fallback format Atom's <updated> never needs.
    assertThat(item.published()).isEqualTo(Instant.parse("2024-10-02T15:00:00Z"));
  }

  /**
   * A feed whose own root element is {@code <channel>} rather than {@code <rss>} -- an unusual but
   * still-valid shape the parser accepts via the second half of its {@code "rss" || "channel"}
   * root-element check.
   */
  @Test
  void aFeedWhoseRootElementIsChannelDirectlyIsAlsoRecognised() {
    String channelRoot =
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <channel>
          <item>
            <guid>tag:channel-root</guid>
            <title>v4.0.0</title>
            <link>https://example.test/release/4.0.0</link>
            <description>Body.</description>
          </item>
        </channel>
        """;

    assertThat(FeedParser.parse(channelRoot)).hasSize(1);
  }

  @Test
  void anItemWithNoLinkElementAtAllYieldsANullLink() {
    String rss =
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <item>
              <guid>tag:nolink</guid>
              <title>v5.0.0</title>
              <description>No link here.</description>
            </item>
          </channel>
        </rss>
        """;

    List<FeedItem> items = FeedParser.parse(rss);

    assertThat(items).hasSize(1);
    assertThat(items.get(0).link()).isNull();
  }

  /**
   * A {@code <link>} element that is present but carries neither an {@code href} attribute nor any
   * text content -- distinct from the "no {@code <link>} element at all" case above, and from the
   * normal Atom ({@code href}-attribute) and RSS (text-content) cases: this exercises the loop
   * falling through both the {@code href} and the text branches for the same element before
   * continuing to look for another one.
   */
  @Test
  void aLinkElementWithNeitherAnHrefNorAnyTextYieldsANullLink() {
    String rss =
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <item>
              <guid>tag:emptylink</guid>
              <title>v7.0.0</title>
              <link></link>
              <description>Body.</description>
            </item>
          </channel>
        </rss>
        """;

    List<FeedItem> items = FeedParser.parse(rss);

    assertThat(items).hasSize(1);
    assertThat(items.get(0).link()).isNull();
  }

  @Test
  void aPublishedDateThatMatchesNeitherIsoNorRfc1123YieldsANullPublishedTimestamp() {
    String rss =
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <item>
              <guid>tag:baddate</guid>
              <title>v6.0.0</title>
              <link>https://example.test/release/6.0.0</link>
              <description>Body.</description>
              <pubDate>not a real date at all</pubDate>
            </item>
          </channel>
        </rss>
        """;

    List<FeedItem> items = FeedParser.parse(rss);

    assertThat(items).hasSize(1);
    assertThat(items.get(0).published()).isNull();
  }

  @Test
  void multipleItemsInOneFeedAreAllParsed() {
    String rss =
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <item><guid>tag:a</guid><title>v1</title><link>https://example.test/a</link></item>
            <item><guid>tag:b</guid><title>v2</title><link>https://example.test/b</link></item>
          </channel>
        </rss>
        """;

    assertThat(FeedParser.parse(rss)).hasSize(2);
  }
}

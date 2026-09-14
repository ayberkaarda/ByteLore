package dev.bytelore.server.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.bytelore.server.common.UuidV7;
import dev.bytelore.server.content.admin.AdminBlogPostService;
import dev.bytelore.server.domain.PipelineStep;
import dev.bytelore.server.domain.WhitelistSource;
import dev.bytelore.server.repository.SourceUpdateRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * A pure unit test for {@link PipelineItemProcessor}, covering the defensive checks that never fire
 * through {@link BlogIngestPipelineService}'s normal call path and are therefore invisible to
 * {@code BlogPipelineIT} -- {@code SOURCE_WHITELISTED} failing (the pipeline service already skips
 * a disabled source before ever reaching here, but this method has no way to know it is only ever
 * called that way) and the case where no version string can be extracted at all -- plus the {@code
 * CONTENT_SANITY} rejection branch and {@code buildRawContent}'s null-field handling, none of which
 * the extensive happy-path/rejection fixtures in {@code BlogPipelineIT} happen to trigger.
 *
 * <p>{@link AdminBlogPostService} is mocked rather than wired to a real database -- every scenario
 * below is rejected before a draft would ever be created, so the mock's {@code createAutoDraft} is
 * asserted to be uncalled rather than exercised.
 */
class PipelineItemProcessorTest {

  private final SourceUpdateRepository sourceUpdates = mock(SourceUpdateRepository.class);
  private final VersionConfirmationService versionConfirmation =
      mock(VersionConfirmationService.class);
  private final PipelineAuditor auditor = mock(PipelineAuditor.class);
  private final PipelineProperties properties = new PipelineProperties();
  private final AdminBlogPostService blogPostService = mock(AdminBlogPostService.class);
  private final JsonMapper jsonMapper = JsonMapper.builder().build();
  private final Clock clock = Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC);

  private PipelineItemProcessor processor;
  private WhitelistSource source;
  private final UUID actorUserId = UUID.randomUUID();

  @BeforeEach
  void setUp() {
    processor =
        new PipelineItemProcessor(
            sourceUpdates,
            versionConfirmation,
            auditor,
            properties,
            blogPostService,
            jsonMapper,
            clock);
    source = new WhitelistSource();
    source.setId(UuidV7.randomUuid());
    source.setName("test-source");
    source.setFeedUrl("https://example.test/feed");
    source.setVerifyUrlPattern("https://example.test/verify/{version}");
    source.setEnabled(true);
    when(sourceUpdates.findByWhitelistSourceIdAndContentHash(any(), anyString()))
        .thenReturn(Optional.empty());
    when(sourceUpdates.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
  }

  /**
   * No version-shaped substring anywhere in the title or the feed id: rejected at {@code
   * VERSION_CONFIRMED} without ever calling out to {@link VersionConfirmationService}. The item's
   * title is {@code null} too, which exercises {@code buildRawContent}'s null-title branch as a
   * side effect -- every other scenario in this class uses a non-null title.
   */
  @Test
  void noExtractableVersionStringIsRejectedWithoutCallingVersionConfirmation() {
    FeedItem item =
        new FeedItem(null, null, "https://example.test/r", "Some content, no version here.", null);

    ItemOutcome outcome = processor.process(source, item, actorUserId);

    assertThat(outcome.kind()).isEqualTo(ItemOutcome.Kind.REJECTED);
    assertThat(outcome.rejection().failedCheck()).isEqualTo(VerifyCheckRecord.VERSION_CONFIRMED);
    assertThat(outcome.rejection().detail()).contains("No version string could be extracted.");
    org.mockito.Mockito.verifyNoInteractions(versionConfirmation);
    verify(blogPostService, never()).createAutoDraft(any(), any(), any(), any(), any(), any());
  }

  /**
   * A source with {@code enabled = false} handed directly to {@link PipelineItemProcessor#process}
   * -- something {@link BlogIngestPipelineService} itself never does, since it skips a disabled
   * source before ever building a fetch cycle, but a defensive check this class still owns and
   * still has to answer correctly if it is ever reached some other way. The item's content is
   * {@code null}, exercising {@code buildRawContent}'s null-content branch.
   */
  @Test
  void aDisabledSourceFailsSourceWhitelistedBeforeAnyOtherCheckRuns() {
    source.setEnabled(false);
    FeedItem item = new FeedItem("tag:1", "v1.0.0", "https://example.test/r", null, null);

    ItemOutcome outcome = processor.process(source, item, actorUserId);

    assertThat(outcome.kind()).isEqualTo(ItemOutcome.Kind.REJECTED);
    assertThat(outcome.rejection().failedCheck()).isEqualTo(VerifyCheckRecord.SOURCE_WHITELISTED);
    assertThat(outcome.rejection().versionString()).isEqualTo("v1.0.0");
    org.mockito.Mockito.verifyNoInteractions(versionConfirmation);
    verify(auditor)
        .record(
            org.mockito.ArgumentMatchers.eq(PipelineStep.VERIFY),
            org.mockito.ArgumentMatchers.isNull(),
            any(),
            org.mockito.ArgumentMatchers.eq(source.getId()),
            org.mockito.ArgumentMatchers.eq(actorUserId),
            org.mockito.ArgumentMatchers.isNull(),
            org.mockito.ArgumentMatchers.isNull(),
            org.mockito.ArgumentMatchers.contains("SOURCE_WHITELISTED"));
  }

  /**
   * Every earlier check passes -- whitelisted, recent, stable, version-confirmed, unseen hash --
   * but the item has no usable {@code https://} link, so {@code CONTENT_SANITY} fails and the item
   * is rejected without a draft ever being built.
   */
  @Test
  void anItemWithNoUsableHttpsLinkFailsContentSanity() {
    when(versionConfirmation.confirm(anyString(), anyString()))
        .thenReturn(VersionConfirmationService.VerifyOutcome.passed("confirmed"));
    FeedItem item =
        new FeedItem(
            "tag:2",
            "2.5.0",
            null, // no source link at all
            "Plenty of content, long enough to pass the length check on its own merits here.",
            null);

    ItemOutcome outcome = processor.process(source, item, actorUserId);

    assertThat(outcome.kind()).isEqualTo(ItemOutcome.Kind.REJECTED);
    assertThat(outcome.rejection().failedCheck()).isEqualTo(VerifyCheckRecord.CONTENT_SANITY);
    assertThat(outcome.rejection().detail()).contains("no usable https:// link");
    verify(blogPostService, never()).createAutoDraft(any(), any(), any(), any(), any(), any());
  }
}

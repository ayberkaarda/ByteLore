package dev.bytelore.server.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.bytelore.server.common.ApiException;
import dev.bytelore.server.common.ErrorCode;
import dev.bytelore.server.common.UuidV7;
import dev.bytelore.server.domain.PipelineStep;
import dev.bytelore.server.domain.WhitelistSource;
import dev.bytelore.server.repository.WhitelistSourceRepository;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import net.javacrumbs.shedlock.core.SimpleLock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * A pure unit test for {@link BlogIngestPipelineService}, with every collaborator mocked -- {@link
 * PipelineItemProcessor} in particular, so the per-item verification chain itself (already
 * exercised end to end against a real database in {@code BlogPipelineIT}) is out of scope here.
 * What this class alone is responsible for is the orchestration around that chain: looking up the
 * source, taking the ShedLock, skipping a disabled source without ever calling the network,
 * tallying the four possible {@link ItemOutcome.Kind}s into a {@link FetchCycleResult}, surviving
 * one item throwing instead of returning an outcome, and always touching {@code lastFetchedAt} --
 * even when the feed request itself failed.
 */
class BlogIngestPipelineServiceTest {

  private final WhitelistSourceRepository whitelistSources = mock(WhitelistSourceRepository.class);
  private final PipelineLockService lockService = mock(PipelineLockService.class);
  private final PipelineHttpClient httpClient = mock(PipelineHttpClient.class);
  private final PipelineItemProcessor itemProcessor = mock(PipelineItemProcessor.class);
  private final PipelineAuditor auditor = mock(PipelineAuditor.class);
  private final Clock clock = Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC);
  private final SimpleLock simpleLock = mock(SimpleLock.class);

  private BlogIngestPipelineService service;
  private WhitelistSource source;
  private final UUID actorUserId = UUID.randomUUID();

  @BeforeEach
  void setUp() {
    service =
        new BlogIngestPipelineService(
            whitelistSources, lockService, httpClient, itemProcessor, auditor, clock);
    source = new WhitelistSource();
    source.setId(UuidV7.randomUuid());
    source.setName("test-source");
    source.setFeedUrl("https://example.test/feed");
    source.setVerifyUrlPattern("https://example.test/verify/{version}");
    source.setEnabled(true);
    when(whitelistSources.findById(source.getId())).thenReturn(Optional.of(source));
    when(lockService.tryLock(source.getId())).thenReturn(Optional.of(simpleLock));
  }

  private static String atomFeedWithEntries(int count) {
    StringBuilder entries = new StringBuilder();
    for (int i = 0; i < count; i++) {
      entries.append(
          """
          <entry>
            <id>tag:%d</id>
            <title>v1.0.%d</title>
            <link href="https://example.test/release/%d"/>
            <updated>2026-01-01T00:00:00Z</updated>
            <content type="html">Some release content, long enough to not matter here.</content>
          </entry>
          """
              .formatted(i, i, i));
    }
    return """
        <?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Fixture Feed</title>
        %s</feed>
        """
        .formatted(entries);
  }

  // ---- Source lookup and locking ---------------------------------------------------------------

  @Test
  void aNonExistentWhitelistSourceIdThrowsWithoutEverTryingToLock() {
    UUID unknownId = UUID.randomUUID();
    when(whitelistSources.findById(unknownId)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.runFetchCycle(unknownId, actorUserId))
        .isInstanceOf(ApiException.class)
        .extracting(e -> ((ApiException) e).code())
        .isEqualTo(ErrorCode.WHITELIST_SOURCE_NOT_FOUND);

    verify(lockService, never()).tryLock(any());
  }

  @Test
  void aSourceAlreadyLockedAnswersPipelineRunInProgressAndNeverCallsTheItemProcessor()
      throws Exception {
    when(lockService.tryLock(source.getId())).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.runFetchCycle(source.getId(), actorUserId))
        .isInstanceOf(ApiException.class)
        .extracting(e -> ((ApiException) e).code())
        .isEqualTo(ErrorCode.PIPELINE_RUN_IN_PROGRESS);

    verify(httpClient, never()).get(anyString());
    verify(itemProcessor, never()).process(any(), any(), any());
  }

  // ---- Disabled source
  // ---------------------------------------------------------------------------

  @Test
  void aDisabledSourceIsSkippedWithoutTouchingTheNetworkAndTheLockIsStillReleased()
      throws Exception {
    source.setEnabled(false);

    FetchCycleResult result = service.runFetchCycle(source.getId(), actorUserId);

    assertThat(result.fetched()).isZero();
    assertThat(result.created()).isZero();
    verify(httpClient, never()).get(anyString());
    verify(itemProcessor, never()).process(any(), any(), any());
    verify(auditor)
        .record(
            eq(PipelineStep.FETCH),
            isNull(),
            isNull(),
            eq(source.getId()),
            eq(actorUserId),
            isNull(),
            isNull(),
            contains("disabled"));
    verify(simpleLock).unlock();
    // A disabled source is never fetched, so its fetch timestamp is left untouched.
    verify(whitelistSources, never()).save(any());
  }

  // ---- Feed fetch failure modes
  // ------------------------------------------------------------------

  @Test
  void aNonTwoHundredFeedResponseYieldsNoItemsButStillTouchesLastFetchedAt() throws Exception {
    when(httpClient.get(source.getFeedUrl()))
        .thenReturn(new PipelineHttpClient.HttpFetchResult(503, "unavailable"));

    FetchCycleResult result = service.runFetchCycle(source.getId(), actorUserId);

    assertThat(result.fetched()).isZero();
    verify(itemProcessor, never()).process(any(), any(), any());
    verify(auditor)
        .record(
            eq(PipelineStep.FETCH),
            isNull(),
            isNull(),
            eq(source.getId()),
            eq(actorUserId),
            isNull(),
            isNull(),
            contains("HTTP 503"));
    verify(whitelistSources).save(source);
    assertThat(source.getLastFetchedAt()).isEqualTo(Instant.now(clock));
    verify(simpleLock).unlock();
  }

  @Test
  void aFeedRequestThatThrowsYieldsNoItemsButStillTouchesLastFetchedAt() throws Exception {
    when(httpClient.get(source.getFeedUrl())).thenThrow(new IOException("connection reset"));

    FetchCycleResult result = service.runFetchCycle(source.getId(), actorUserId);

    assertThat(result.fetched()).isZero();
    verify(itemProcessor, never()).process(any(), any(), any());
    verify(auditor)
        .record(
            eq(PipelineStep.FETCH),
            isNull(),
            isNull(),
            eq(source.getId()),
            eq(actorUserId),
            isNull(),
            isNull(),
            contains("Feed fetch failed"));
    verify(whitelistSources).save(source);
    verify(simpleLock).unlock();
  }

  // ---- Tallying every ItemOutcome.Kind
  // ------------------------------------------------------------

  @Test
  void everyOutcomeKindIsTalliedCorrectlyAndDeferredItemsAreExcludedFromFetched() throws Exception {
    when(httpClient.get(source.getFeedUrl()))
        .thenReturn(new PipelineHttpClient.HttpFetchResult(200, atomFeedWithEntries(4)));
    UUID createdSourceUpdateId = UuidV7.randomUuid();
    when(itemProcessor.process(eq(source), any(FeedItem.class), eq(actorUserId)))
        .thenReturn(ItemOutcome.created(createdSourceUpdateId))
        .thenReturn(ItemOutcome.duplicate())
        .thenReturn(
            ItemOutcome.rejected(new Rejection("1.0.2", VerifyCheckRecord.CONTENT_SANITY, "bad")))
        .thenReturn(
            ItemOutcome.deferred(
                new Deferral("1.0.3", VerifyCheckRecord.VERSION_CONFIRMED, "rate limited")));

    FetchCycleResult result = service.runFetchCycle(source.getId(), actorUserId);

    assertThat(result.created()).isEqualTo(1);
    assertThat(result.duplicates()).isEqualTo(1);
    assertThat(result.rejected()).isEqualTo(1);
    // fetched = created + duplicates + rejected, deliberately excluding the deferred item.
    assertThat(result.fetched()).isEqualTo(3);
    assertThat(result.createdSourceUpdateIds()).containsExactly(createdSourceUpdateId);
    assertThat(result.rejections()).hasSize(1);
    assertThat(result.rejections().get(0).failedCheck())
        .isEqualTo(VerifyCheckRecord.CONTENT_SANITY);
    verify(itemProcessor, times(4)).process(eq(source), any(FeedItem.class), eq(actorUserId));
    verify(whitelistSources).save(source);
  }

  // ---- One item throwing does not end the cycle
  // ----------------------------------------------------

  @Test
  void anItemProcessorThrowingWithAMessageIsCountedAsAnItemFailedRejectionAndTheCycleContinues()
      throws Exception {
    when(httpClient.get(source.getFeedUrl()))
        .thenReturn(new PipelineHttpClient.HttpFetchResult(200, atomFeedWithEntries(2)));
    when(itemProcessor.process(eq(source), any(FeedItem.class), eq(actorUserId)))
        .thenThrow(new IllegalStateException("boom"))
        .thenReturn(ItemOutcome.created(UuidV7.randomUuid()));

    FetchCycleResult result = service.runFetchCycle(source.getId(), actorUserId);

    // The failed item is counted as a rejection, and the second item is still reached.
    assertThat(result.rejected()).isEqualTo(1);
    assertThat(result.created()).isEqualTo(1);
    assertThat(result.rejections().get(0).failedCheck()).isEqualTo("ITEM_FAILED");
    assertThat(result.rejections().get(0).detail())
        .contains("IllegalStateException")
        .contains("boom");
    verify(auditor)
        .record(
            eq(PipelineStep.VERIFY),
            isNull(),
            isNull(),
            eq(source.getId()),
            eq(actorUserId),
            isNull(),
            isNull(),
            contains("ITEM_FAILED"));
    verify(itemProcessor, times(2)).process(eq(source), any(FeedItem.class), eq(actorUserId));
  }

  @Test
  void anItemProcessorThrowingWithNoMessageFallsBackToTheExceptionClassNameAlone()
      throws Exception {
    when(httpClient.get(source.getFeedUrl()))
        .thenReturn(new PipelineHttpClient.HttpFetchResult(200, atomFeedWithEntries(1)));
    when(itemProcessor.process(eq(source), any(FeedItem.class), eq(actorUserId)))
        .thenThrow(new IllegalStateException());

    FetchCycleResult result = service.runFetchCycle(source.getId(), actorUserId);

    assertThat(result.rejected()).isEqualTo(1);
    assertThat(result.rejections().get(0).detail()).isEqualTo("IllegalStateException");
  }

  /**
   * {@code describe()} falls back to the exception's class name alone whenever the message is
   * unusable -- not only when it is {@code null} (the case above), but also when it is present and
   * empty, which is a distinct branch of its {@code message == null || message.isBlank()} check.
   */
  @Test
  void anItemProcessorThrowingWithABlankMessageAlsoFallsBackToTheExceptionClassNameAlone()
      throws Exception {
    when(httpClient.get(source.getFeedUrl()))
        .thenReturn(new PipelineHttpClient.HttpFetchResult(200, atomFeedWithEntries(1)));
    when(itemProcessor.process(eq(source), any(FeedItem.class), eq(actorUserId)))
        .thenThrow(new IllegalStateException(""));

    FetchCycleResult result = service.runFetchCycle(source.getId(), actorUserId);

    assertThat(result.rejected()).isEqualTo(1);
    assertThat(result.rejections().get(0).detail()).isEqualTo("IllegalStateException");
  }
}

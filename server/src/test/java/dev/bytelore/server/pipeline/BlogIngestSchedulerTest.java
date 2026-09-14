package dev.bytelore.server.pipeline;

import static org.mockito.ArgumentMatchers.any;
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
import dev.bytelore.server.domain.WhitelistSource;
import dev.bytelore.server.repository.WhitelistSourceRepository;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * A pure unit test, deliberately without any Spring context or ShedLock: {@link
 * BlogIngestScheduler} is a thin wrapper around {@link BlogIngestPipelineService#runFetchCycle}
 * (the ShedLock acquisition itself lives one layer down, inside that call), so what this class
 * needs proving is narrower than "the scheduled job runs end to end" -- it is that the wrapper (1)
 * calls the identical fetch cycle the manual trigger calls, for every {@code enabled = true}
 * source, with a {@code null} actor, and (2) never lets one source's failure stop the rest of the
 * sweep, regardless of whether that failure was an expected {@link ApiException} (logged
 * differently depending on its code) or an entirely unchecked exception.
 *
 * <p>{@link BlogIngestPipelineService} and {@link WhitelistSourceRepository} are both plain Spring
 * beans with no final methods, so a hand-rolled Mockito mock is enough here -- the same "no Spring
 * context needed" reasoning {@link PipelineHttpClientTest} documents for itself.
 */
class BlogIngestSchedulerTest {

  private final WhitelistSourceRepository whitelistSources = mock(WhitelistSourceRepository.class);
  private final BlogIngestPipelineService pipeline = mock(BlogIngestPipelineService.class);
  private final BlogIngestScheduler scheduler = new BlogIngestScheduler(whitelistSources, pipeline);

  private static WhitelistSource source(String name) {
    WhitelistSource source = new WhitelistSource();
    source.setId(UuidV7.randomUuid());
    source.setName(name);
    return source;
  }

  @Test
  void noEnabledSourcesMeansTheFetchCycleIsNeverCalled() {
    when(whitelistSources.findByEnabledTrue()).thenReturn(List.of());

    scheduler.fetchAllEnabledSources();

    verify(pipeline, never()).runFetchCycle(any(), any());
  }

  @Test
  void runsTheExactSameFetchCycleForEveryEnabledSourceWithANullActor() {
    WhitelistSource a = source("source-a");
    WhitelistSource b = source("source-b");
    when(whitelistSources.findByEnabledTrue()).thenReturn(List.of(a, b));

    scheduler.fetchAllEnabledSources();

    // actorUserId is null for every scheduled call: a scheduled run has no human behind it, and
    // the audit trail (written inside runFetchCycle) records that honestly.
    verify(pipeline).runFetchCycle(eq(a.getId()), isNull());
    verify(pipeline).runFetchCycle(eq(b.getId()), isNull());
  }

  @Test
  void aPipelineRunInProgressFailureIsSwallowedAndDoesNotStopTheSweep() {
    WhitelistSource stuck = source("source-locked");
    WhitelistSource next = source("source-next");
    when(whitelistSources.findByEnabledTrue()).thenReturn(List.of(stuck, next));
    when(pipeline.runFetchCycle(eq(stuck.getId()), isNull()))
        .thenThrow(
            new ApiException(
                ErrorCode.PIPELINE_RUN_IN_PROGRESS, "A fetch is already running for this source."));

    scheduler.fetchAllEnabledSources();

    // The source colliding with an in-progress run does not abort the loop: the next source is
    // still reached.
    verify(pipeline).runFetchCycle(eq(next.getId()), isNull());
  }

  @Test
  void anApiExceptionWithAnyOtherCodeIsAlsoSwallowedAndDoesNotStopTheSweep() {
    WhitelistSource failing = source("source-failing");
    WhitelistSource next = source("source-next");
    when(whitelistSources.findByEnabledTrue()).thenReturn(List.of(failing, next));
    when(pipeline.runFetchCycle(eq(failing.getId()), isNull()))
        .thenThrow(
            new ApiException(
                ErrorCode.WHITELIST_SOURCE_NOT_FOUND, "No whitelist source exists with this id."));

    scheduler.fetchAllEnabledSources();

    verify(pipeline, times(1)).runFetchCycle(eq(failing.getId()), isNull());
    verify(pipeline).runFetchCycle(eq(next.getId()), isNull());
  }

  @Test
  void anEntirelyUnexpectedExceptionIsAlsoSwallowedAndDoesNotStopTheSweep() {
    WhitelistSource crashing = source("source-crashing");
    WhitelistSource next = source("source-next");
    when(whitelistSources.findByEnabledTrue()).thenReturn(List.of(crashing, next));
    when(pipeline.runFetchCycle(eq(crashing.getId()), isNull()))
        .thenThrow(new IllegalStateException("boom"));

    scheduler.fetchAllEnabledSources();

    verify(pipeline).runFetchCycle(eq(next.getId()), isNull());
  }
}

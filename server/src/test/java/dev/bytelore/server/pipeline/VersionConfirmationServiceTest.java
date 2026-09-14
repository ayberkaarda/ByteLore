package dev.bytelore.server.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import org.junit.jupiter.api.Test;

/**
 * A pure unit test for {@link VersionConfirmationService}, with {@link PipelineHttpClient} mocked
 * so every branch of the {@code VERSION_CONFIRMED} check (§5.7) can be exercised without a real
 * network call: the version-string pre-validation, the request failure path, the 403/429 deferral,
 * every other non-200 status, and the NFC-normalized substring match itself.
 */
class VersionConfirmationServiceTest {

  private final PipelineHttpClient httpClient = mock(PipelineHttpClient.class);
  private final VersionConfirmationService service = new VersionConfirmationService(httpClient);

  private static final String VERIFY_PATTERN = "https://example.test/verify/{version}";

  @Test
  void aNullVersionStringFailsWithoutEverCallingTheHttpClient() throws Exception {
    VersionConfirmationService.VerifyOutcome outcome = service.confirm(VERIFY_PATTERN, null);

    assertThat(outcome.passed()).isFalse();
    assertThat(outcome.deferred()).isFalse();
    org.mockito.Mockito.verifyNoInteractions(httpClient);
  }

  @Test
  void aVersionStringViolatingTheAllowedPatternFailsWithoutEverCallingTheHttpClient()
      throws Exception {
    // A path traversal / scheme injection attempt: never placed in a URL.
    VersionConfirmationService.VerifyOutcome outcome =
        service.confirm(VERIFY_PATTERN, "../../etc/passwd");

    assertThat(outcome.passed()).isFalse();
    assertThat(outcome.deferred()).isFalse();
    assertThat(outcome.detail()).contains("does not match the required pattern");
    org.mockito.Mockito.verifyNoInteractions(httpClient);
  }

  @Test
  void anExceptionFromTheHttpClientFailsWithADetailedMessage() throws Exception {
    when(httpClient.get(anyString())).thenThrow(new IOException("connection refused"));

    VersionConfirmationService.VerifyOutcome outcome = service.confirm(VERIFY_PATTERN, "1.2.3");

    assertThat(outcome.passed()).isFalse();
    assertThat(outcome.deferred()).isFalse();
    assertThat(outcome.detail()).contains("connection refused");
  }

  @Test
  void aNonTwoHundredNonRateLimitStatusFails() throws Exception {
    when(httpClient.get(anyString()))
        .thenReturn(new PipelineHttpClient.HttpFetchResult(500, "internal error"));

    VersionConfirmationService.VerifyOutcome outcome = service.confirm(VERIFY_PATTERN, "1.2.3");

    assertThat(outcome.passed()).isFalse();
    assertThat(outcome.deferred()).isFalse();
    assertThat(outcome.detail()).contains("HTTP 500");
  }

  @Test
  void aFourHundredThreeStatusIsDeferredNotFailed() throws Exception {
    when(httpClient.get(anyString()))
        .thenReturn(new PipelineHttpClient.HttpFetchResult(403, "rate limited"));

    VersionConfirmationService.VerifyOutcome outcome = service.confirm(VERIFY_PATTERN, "1.2.3");

    assertThat(outcome.passed()).isFalse();
    assertThat(outcome.deferred()).isTrue();
  }

  @Test
  void aFourTwentyNineStatusIsDeferredNotFailed() throws Exception {
    when(httpClient.get(anyString()))
        .thenReturn(new PipelineHttpClient.HttpFetchResult(429, "too many requests"));

    VersionConfirmationService.VerifyOutcome outcome = service.confirm(VERIFY_PATTERN, "1.2.3");

    assertThat(outcome.passed()).isFalse();
    assertThat(outcome.deferred()).isTrue();
  }

  @Test
  void aTwoHundredWithoutTheVersionStringInTheBodyFails() throws Exception {
    when(httpClient.get(anyString()))
        .thenReturn(new PipelineHttpClient.HttpFetchResult(200, "nothing relevant here"));

    VersionConfirmationService.VerifyOutcome outcome = service.confirm(VERIFY_PATTERN, "1.2.3");

    assertThat(outcome.passed()).isFalse();
    assertThat(outcome.deferred()).isFalse();
    assertThat(outcome.detail()).contains("did not contain");
  }

  @Test
  void aTwoHundredWithTheVersionStringPresentPasses() throws Exception {
    when(httpClient.get(anyString()))
        .thenReturn(new PipelineHttpClient.HttpFetchResult(200, "Now shipping v1.2.3 today"));

    VersionConfirmationService.VerifyOutcome outcome = service.confirm(VERIFY_PATTERN, "1.2.3");

    assertThat(outcome.passed()).isTrue();
    assertThat(outcome.deferred()).isFalse();
  }

  @Test
  void aNullResponseBodyIsTreatedAsEmptyRatherThanThrowing() throws Exception {
    when(httpClient.get(anyString())).thenReturn(new PipelineHttpClient.HttpFetchResult(200, null));

    VersionConfirmationService.VerifyOutcome outcome = service.confirm(VERIFY_PATTERN, "1.2.3");

    assertThat(outcome.passed()).isFalse();
  }

  /**
   * The version is substituted into the {@code {version}} placeholder of the pattern -- proven here
   * by asserting on the exact URL the mock received, not merely on the outcome.
   */
  @Test
  void theVersionIsSubstitutedIntoThePatternPlaceholder() throws Exception {
    when(httpClient.get(anyString()))
        .thenReturn(new PipelineHttpClient.HttpFetchResult(200, "confirmed"));

    service.confirm("https://example.test/verify/{version}/tags", "1.2.3+build.1");

    org.mockito.Mockito.verify(httpClient).get("https://example.test/verify/1.2.3+build.1/tags");
  }
}

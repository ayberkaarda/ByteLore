package dev.bytelore.server.pipeline;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

/**
 * A pure unit test for {@link PipelineProperties}: the getter/setter round trip every
 * {@code @ConfigurationProperties} field needs (Spring's binder relies on exactly this contract),
 * and the startup diagnostic that fires when no GitHub token is configured.
 */
class PipelinePropertiesTest {

  @Test
  void everyPropertyRoundTripsThroughItsSetterAndGetter() {
    PipelineProperties properties = new PipelineProperties();

    properties.setFetchCron("0 0 * * * *");
    properties.setHttpConnectTimeout(Duration.ofSeconds(3));
    properties.setHttpReadTimeout(Duration.ofSeconds(7));
    properties.setMinContentLength(100);
    properties.setManualFetchPerHour(12);
    properties.setLockAtMostFor(Duration.ofMinutes(5));
    properties.setLockAtLeastFor(Duration.ofSeconds(2));
    properties.setGithubToken("ghp_example");
    properties.setMaxItemAge(Duration.ofDays(7));

    assertThat(properties.getFetchCron()).isEqualTo("0 0 * * * *");
    assertThat(properties.getHttpConnectTimeout()).isEqualTo(Duration.ofSeconds(3));
    assertThat(properties.getHttpReadTimeout()).isEqualTo(Duration.ofSeconds(7));
    assertThat(properties.getMinContentLength()).isEqualTo(100);
    assertThat(properties.getManualFetchPerHour()).isEqualTo(12);
    assertThat(properties.getLockAtMostFor()).isEqualTo(Duration.ofMinutes(5));
    assertThat(properties.getLockAtLeastFor()).isEqualTo(Duration.ofSeconds(2));
    assertThat(properties.getGithubToken()).isEqualTo("ghp_example");
    assertThat(properties.getMaxItemAge()).isEqualTo(Duration.ofDays(7));
  }

  @Test
  void defaultsAreTheDocumentedValues() {
    PipelineProperties properties = new PipelineProperties();

    assertThat(properties.getFetchCron()).isEqualTo("0 0 0/6 * * *");
    assertThat(properties.getMinContentLength()).isEqualTo(40);
    assertThat(properties.getManualFetchPerHour()).isEqualTo(6);
    assertThat(properties.getMaxItemAge()).isEqualTo(Duration.ofDays(14));
    assertThat(properties.getGithubToken()).isEmpty();
  }

  @Test
  void warnIfGithubTokenMissingLogsAWarningWhenTheTokenIsBlank() {
    PipelineProperties properties = new PipelineProperties();
    properties.setGithubToken("");

    ListAppender<ILoggingEvent> appender = attachAppender();
    try {
      properties.warnIfGithubTokenMissing();
      assertThat(appender.list)
          .anySatisfy(
              event -> assertThat(event.getFormattedMessage()).contains("github-token is not set"));
    } finally {
      detachAppender(appender);
    }
  }

  @Test
  void warnIfGithubTokenMissingLogsAWarningWhenTheTokenIsNull() {
    PipelineProperties properties = new PipelineProperties();
    properties.setGithubToken(null);

    ListAppender<ILoggingEvent> appender = attachAppender();
    try {
      properties.warnIfGithubTokenMissing();
      assertThat(appender.list)
          .anySatisfy(
              event -> assertThat(event.getFormattedMessage()).contains("github-token is not set"));
    } finally {
      detachAppender(appender);
    }
  }

  @Test
  void warnIfGithubTokenMissingLogsNothingWhenATokenIsConfigured() {
    PipelineProperties properties = new PipelineProperties();
    properties.setGithubToken("ghp_configured");

    ListAppender<ILoggingEvent> appender = attachAppender();
    try {
      properties.warnIfGithubTokenMissing();
      assertThat(appender.list).isEmpty();
    } finally {
      detachAppender(appender);
    }
  }

  private static ListAppender<ILoggingEvent> attachAppender() {
    ch.qos.logback.classic.Logger logger =
        (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(PipelineProperties.class);
    ListAppender<ILoggingEvent> appender = new ListAppender<>();
    appender.start();
    logger.addAppender(appender);
    return appender;
  }

  private static void detachAppender(ListAppender<ILoggingEvent> appender) {
    ch.qos.logback.classic.Logger logger =
        (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(PipelineProperties.class);
    logger.detachAppender(appender);
  }
}

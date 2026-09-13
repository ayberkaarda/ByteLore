package dev.bytelore.server.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One day's bug hunt: a short listing with a deliberate mistake in it, the one-based number of the
 * line that mistake is on, and the explanation a player is shown once they have answered.
 *
 * <p>{@code code} is stored with LF endings only, because the line number is the answer: a body
 * whose line breaks changed between writing and reading would move the answer with them.
 */
@Entity
@Table(name = "puzzles")
public class Puzzle {

  @Id private UUID id;

  @Enumerated(EnumType.STRING)
  @Column(name = "status", nullable = false, length = 20)
  private PuzzleStatus status;

  @Column(name = "puzzle_date", nullable = false)
  private LocalDate puzzleDate;

  @Column(name = "title", nullable = false, length = 200)
  private String title;

  @Column(name = "prompt_markdown", columnDefinition = "text")
  private String promptMarkdown;

  @Column(name = "language", nullable = false, length = 40)
  private String language;

  @Column(name = "code", nullable = false, columnDefinition = "text")
  private String code;

  @Column(name = "buggy_line", nullable = false)
  private int buggyLine;

  @Column(name = "explanation_markdown", nullable = false, columnDefinition = "text")
  private String explanationMarkdown;

  @Column(name = "created_by", nullable = false)
  private UUID createdBy;

  @Column(name = "published_at")
  private Instant publishedAt;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @Version
  @Column(name = "version", nullable = false)
  private long version;

  public Puzzle() {}

  public UUID getId() {
    return id;
  }

  public void setId(UUID id) {
    this.id = id;
  }

  public PuzzleStatus getStatus() {
    return status;
  }

  public void setStatus(PuzzleStatus status) {
    this.status = status;
  }

  public LocalDate getPuzzleDate() {
    return puzzleDate;
  }

  public void setPuzzleDate(LocalDate puzzleDate) {
    this.puzzleDate = puzzleDate;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getPromptMarkdown() {
    return promptMarkdown;
  }

  public void setPromptMarkdown(String promptMarkdown) {
    this.promptMarkdown = promptMarkdown;
  }

  public String getLanguage() {
    return language;
  }

  public void setLanguage(String language) {
    this.language = language;
  }

  public String getCode() {
    return code;
  }

  public void setCode(String code) {
    this.code = code;
  }

  public int getBuggyLine() {
    return buggyLine;
  }

  public void setBuggyLine(int buggyLine) {
    this.buggyLine = buggyLine;
  }

  public String getExplanationMarkdown() {
    return explanationMarkdown;
  }

  public void setExplanationMarkdown(String explanationMarkdown) {
    this.explanationMarkdown = explanationMarkdown;
  }

  public UUID getCreatedBy() {
    return createdBy;
  }

  public void setCreatedBy(UUID createdBy) {
    this.createdBy = createdBy;
  }

  public Instant getPublishedAt() {
    return publishedAt;
  }

  public void setPublishedAt(Instant publishedAt) {
    this.publishedAt = publishedAt;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(Instant createdAt) {
    this.createdAt = createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(Instant updatedAt) {
    this.updatedAt = updatedAt;
  }

  public long getVersion() {
    return version;
  }

  public void setVersion(long version) {
    this.version = version;
  }
}

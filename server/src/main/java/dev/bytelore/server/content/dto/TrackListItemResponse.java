package dev.bytelore.server.content.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * One row of {@code GET /api/v1/tracks} (§5.2.1).
 *
 * <p>{@code lessonIds} lists every visible lesson of the track in reading order -- modules in their
 * display order, lessons in theirs. It is carried on the summary so that a client showing a list of
 * tracks can say how much of each one a reader has finished without fetching every track's full
 * module tree; completion is held per lesson identifier, and without the identifiers a listing can
 * only report what is downloaded, never what is done. {@code lessonCount} is the length of this
 * list, so the two can never disagree.
 */
public record TrackListItemResponse(
    UUID id,
    String slug,
    String title,
    String description,
    String icon,
    int order,
    String locale,
    String requestedLocale,
    boolean isFallback,
    long moduleCount,
    long lessonCount,
    List<UUID> lessonIds,
    int contentVersion,
    Instant updatedAt) {}

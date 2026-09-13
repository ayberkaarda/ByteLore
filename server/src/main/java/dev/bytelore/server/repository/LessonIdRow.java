package dev.bytelore.server.repository;

import java.util.UUID;

/**
 * A lesson's identifier together with the module it belongs to.
 *
 * <p>A projection rather than an entity: the callers that ask "which lessons are in these modules"
 * want primary keys, and a {@code Lesson} carries up to 200,000 characters of markdown that would
 * be loaded, mapped and discarded to answer a question about identifiers.
 *
 * <p>The module identifier travels with each row because a single batched query cannot express "in
 * module order" on its own -- the caller regroups the flat result against the module order it
 * already holds.
 */
public record LessonIdRow(UUID moduleId, UUID lessonId) {}

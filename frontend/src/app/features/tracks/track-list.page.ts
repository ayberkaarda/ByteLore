import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { LibraryDiscovery } from '../../core/library/library-discovery';
import { errorKey } from '../../core/platform/error-key';
import type { TrackSummary } from '../../core/platform/models';
import { PlatformService } from '../../core/platform/platform.service';
import { FallbackBadge } from '../../shared/fallback-badge';
import { StateGlyph } from '../../shared/state-glyph';

@Component({
  selector: 'app-track-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, FallbackBadge, StateGlyph],
  templateUrl: './track-list.page.html',
})
export class TrackListPage {
  private readonly platform = inject(PlatformService);
  private readonly discovery = inject(LibraryDiscovery);

  /**
   * Read once, at construction. The list is the same whichever implementation
   * answers, and this component has no way of telling which one did.
   */
  protected readonly tracks = signal<readonly TrackSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly failure = signal<string | null>(null);
  /** A discovery attempt that failed. Non-blocking: the list above still renders. */
  protected readonly noteKey = signal<string | null>(null);

  /**
   * Whether a download count means anything here. The question is about the
   * capability, not about the platform: a component that asked which build it
   * was in would have learned something it is not allowed to know.
   */
  protected readonly canDownload = this.platform.capabilities.canDownload;

  /**
   * The lessons this reader has finished, by identifier.
   *
   * Same source and the same failure handling as the track detail screen's
   * `completedLessonIds`: one read of the progress store answers for every
   * card on this screen, and a reader with no session (or no network, on the
   * web build) simply sees every card as not-yet-started rather than an
   * error — there is no progress of theirs to show because there is none.
   */
  protected readonly completedLessonIds = signal<ReadonlySet<string>>(new Set<string>());

  /**
   * How many of each card's lessons are finished, keyed by track id.
   *
   * Computed once into a map rather than intersected per card from the
   * template, so a long library does not re-filter the completed set on
   * every change detection pass.
   */
  protected readonly trackCompletionCounts = computed<ReadonlyMap<string, number>>(() => {
    const done = this.completedLessonIds();
    return new Map(
      this.tracks().map((track) => [
        track.id,
        track.lessonIds.filter((lessonId) => done.has(lessonId)).length,
      ]),
    );
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.failure.set(null);
    this.noteKey.set(null);
    this.completedLessonIds.set(new Set<string>());

    // Started here and awaited after the list, so the two overlap.
    const completionPromise = this.loadCompletions();

    try {
      const initial = await this.platform.listTracks();
      const outcome = await this.discovery.discoverTracks(initial);
      this.tracks.set(outcome.value);
      this.noteKey.set(outcome.noteKey);
    } catch (error) {
      this.failure.set(errorKey(error));
    } finally {
      this.completedLessonIds.set(await completionPromise);
      this.loading.set(false);
    }
  }

  /**
   * Reads which lessons are finished, and says nothing when it cannot.
   *
   * Failing here is an ordinary condition rather than a fault: a reader with
   * no session gets a refusal from the progress endpoint every time, and
   * there is no progress of theirs to show because there is none. The screen
   * renders exactly as it would for a reader who has finished nothing, with
   * no error and no note.
   */
  private async loadCompletions(): Promise<ReadonlySet<string>> {
    try {
      const entries = await this.platform.listProgress();
      return new Set(
        entries.filter((entry) => entry.completedAt !== null).map((entry) => entry.lessonId),
      );
    } catch {
      return new Set<string>();
    }
  }
}

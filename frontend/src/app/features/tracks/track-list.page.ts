import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { DownloadStore } from '../../core/library/download-store';
import { LibraryDiscovery } from '../../core/library/library-discovery';
import { LocalizedNav } from '../../core/nav/localized-nav';
import { ConnectivityService } from '../../core/net/connectivity.service';
import { errorKey } from '../../core/platform/error-key';
import type { ProgressEntry, TrackSummary } from '../../core/platform/models';
import { PlatformService } from '../../core/platform/platform.service';
import { BytesFormatPipe } from '../../shared/bytes.pipe';
import { FallbackBadge } from '../../shared/fallback-badge';
import { ProgressBar } from '../../shared/progress-bar';
import { StateGlyph } from '../../shared/state-glyph';

@Component({
  selector: 'app-track-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, BytesFormatPipe, FallbackBadge, ProgressBar, StateGlyph],
  templateUrl: './track-list.page.html',
})
export class TrackListPage {
  /** Prefixes the language segment onto link targets where the build has one. */
  protected readonly nav = inject(LocalizedNav);

  private readonly platform = inject(PlatformService);
  private readonly discovery = inject(LibraryDiscovery);
  private readonly store = inject(DownloadStore);

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
   * Whether the server is reachable. Runtime state rather than a capability —
   * the same fact in both builds — and the library panel reports it because
   * an update count that has not been refreshed is explained by it.
   */
  protected readonly offline = inject(ConnectivityService).offline;

  /**
   * Every progress row this reader has, in whatever order the store returned
   * them.
   *
   * The screen needs two different things from the same read, which is why
   * the rows are kept rather than only the identifiers: which lessons are
   * finished (per card, and in the summary), and which one was touched last
   * (the resume tile). A second read for the second question would be a
   * second chance for the two answers to disagree.
   */
  private readonly progressEntries = signal<readonly ProgressEntry[]>([]);

  /**
   * The lessons this reader has finished, by identifier.
   *
   * Same source and the same failure handling as the track detail screen's
   * `completedLessonIds`: one read of the progress store answers for every
   * card on this screen, and a reader with no session (or no network, on the
   * web build) simply sees every card as not-yet-started rather than an
   * error — there is no progress of theirs to show because there is none.
   */
  protected readonly completedLessonIds = computed<ReadonlySet<string>>(
    () =>
      new Set(
        this.progressEntries()
          .filter((entry) => entry.completedAt !== null)
          .map((entry) => entry.lessonId),
      ),
  );

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

  /** Every lesson in the library, as the denominator of the summary tiles. */
  protected readonly lessonTotal = computed(() =>
    this.tracks().reduce((total, track) => total + track.lessonCount, 0),
  );

  /**
   * Finished lessons across the whole library.
   *
   * Counted over the union of the paths' lesson identifiers rather than by
   * summing the per-card counts: a lesson that appears in two paths is one
   * lesson somebody read once, and summing would let the figure climb past
   * what the reader actually finished.
   */
  protected readonly completedLessonTotal = computed(() => {
    const done = this.completedLessonIds();
    const seen = new Set<string>();
    for (const track of this.tracks()) {
      for (const lessonId of track.lessonIds) {
        if (done.has(lessonId)) {
          seen.add(lessonId);
        }
      }
    }
    return seen.size;
  });

  /**
   * Paths whose every lesson is finished. An empty path is not one of them:
   * "nothing to read" is not an accomplishment, and counting it would make
   * the tile climb when new, empty content appeared.
   */
  protected readonly completedTrackTotal = computed(() => {
    const counts = this.trackCompletionCounts();
    return this.tracks().filter(
      (track) => track.lessonCount > 0 && (counts.get(track.id) ?? 0) >= track.lessonCount,
    ).length;
  });

  protected readonly downloadedLessonTotal = computed(() =>
    this.tracks().reduce((total, track) => total + track.downloadedLessonCount, 0),
  );

  protected readonly updateAvailableTotal = computed(() =>
    this.tracks().reduce((total, track) => total + track.updateAvailableCount, 0),
  );

  /**
   * Queue rows that have not finished — paused and failed ones included, the
   * same reading the shell's badge takes: the figure answers "is there
   * anything left to deal with", and a failed download very much is.
   */
  protected readonly queuedTotal = computed(
    () => this.store.queue().filter((entry) => entry.state !== 'DONE').length,
  );

  protected readonly storageBytes = computed(() => this.store.downloaded().bytes);

  /**
   * The path to offer as "carry on from here", or null when there is nothing
   * to carry on from.
   *
   * The most recently touched progress row wins, by `clientUpdatedAt` — the
   * timestamp the client stamped when the reader acted, which is the one that
   * survives a sync and is comparable between rows written offline and rows
   * written online. Rows are considered whether they mark a lesson finished
   * or explicitly unfinished: both are the reader saying "I was here", and a
   * lesson someone has just un-ticked is precisely where they left off.
   *
   * Null when no row maps onto a path in the library — a lesson that has been
   * withdrawn, or progress belonging to content this device has not
   * discovered. The tile then does not render at all rather than offering an
   * empty state: there is no destination to send anybody to.
   */
  protected readonly continueTrack = computed<TrackSummary | null>(() => {
    const entries = [...this.progressEntries()].sort((left, right) =>
      right.clientUpdatedAt.localeCompare(left.clientUpdatedAt),
    );
    const tracks = this.tracks();
    for (const entry of entries) {
      const match = tracks.find((track) => track.lessonIds.includes(entry.lessonId));
      if (match) {
        return match;
      }
    }
    return null;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.failure.set(null);
    this.noteKey.set(null);
    this.progressEntries.set([]);

    // Started here and awaited after the list, so the two overlap.
    const completionPromise = this.loadCompletions();

    if (this.canDownload) {
      // The shell reads the queue once at startup; this re-read is what keeps
      // the stored-size and queue figures on this screen honest after a batch
      // finished somewhere else. A store that cannot be reached leaves them at
      // zero, which is the same thing the rest of this screen does with a read
      // it did not get.
      void this.store.refreshQueue().catch(() => undefined);
    }

    try {
      const initial = await this.platform.listTracks();
      const outcome = await this.discovery.discoverTracks(initial);
      this.tracks.set(outcome.value);
      this.noteKey.set(outcome.noteKey);
    } catch (error) {
      this.failure.set(errorKey(error));
    } finally {
      this.progressEntries.set(await completionPromise);
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
  private async loadCompletions(): Promise<readonly ProgressEntry[]> {
    try {
      return await this.platform.listProgress();
    } catch {
      return [];
    }
  }
}

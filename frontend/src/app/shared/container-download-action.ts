import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { aggregateLessons, type DownloadUnit } from '../core/library/aggregate';
import { DownloadStore } from '../core/library/download-store';
import { errorKey } from '../core/platform/error-key';
import type { DownloadScope, LessonSummary } from '../core/platform/models';
import { PlatformService } from '../core/platform/platform.service';
import { BytesFormatPipe } from './bytes.pipe';
import { ProgressBar } from './progress-bar';

/**
 * How much visual weight this container's acquire button carries.
 *
 * A saturated accent fill means "this is the one action of the screen", so a
 * view that embeds this component more than once — a learning path that offers
 * its whole self and then each of its modules — can afford the fill on exactly
 * one of them and steps the rest down.
 */
export type ContainerActionTier = 'primary' | 'secondary' | 'ghost';

/**
 * The three button recipes, keyed by tier. They differ only in fill, border and
 * text colour: size stays at the compact step for every tier, because this
 * button sits on a heading row next to a count and a badge, and a taller
 * control would set the row's height on its own.
 *
 * The in-flight controls further down the template are ghost in every tier —
 * pausing or cancelling is never the weightiest thing on a screen.
 */
const ACQUIRE_BUTTON_CLASS: Readonly<Record<ContainerActionTier, string>> = {
  primary:
    'rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-contrast hover:opacity-90 ' +
    'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:opacity-50',
  secondary:
    'rounded-md border border-border-strong bg-surface-raised px-2 py-1 text-xs font-medium ' +
    'text-text hover:bg-surface-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ' +
    'aria-disabled:hover:bg-surface-raised',
  ghost:
    'rounded-md px-2 py-1 text-xs font-medium text-text-muted hover:bg-surface-hover ' +
    'hover:text-text aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ' +
    'aria-disabled:hover:bg-transparent aria-disabled:hover:text-text-muted',
};

/**
 * The download action for a module or a track: neither has an `Availability`
 * of its own, so this renders from an aggregate over the lessons it contains
 * rather than a single enum. "12 of 32 downloaded, one updating" is the
 * container equivalent of a lesson being downloaded and updating at once.
 *
 * There is no delete button here. Removing every lesson in a module or track
 * is a heavier action than the other controls on this component, and it gets
 * its own confirmed flow on the downloads screen instead of a one-click
 * button inline in a lesson list.
 */
@Component({
  selector: 'app-container-download-action',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, BytesFormatPipe, ProgressBar],
  templateUrl: './container-download-action.html',
})
export class ContainerDownloadAction {
  private readonly platform = inject(PlatformService);
  private readonly store = inject(DownloadStore);

  readonly scope = input.required<DownloadScope>();
  readonly title = input.required<string>();
  readonly lessons = input.required<readonly LessonSummary[]>();
  /**
   * Downloadable units this container holds beyond its lessons — a track's
   * mind map is the one that exists today. A module has none and passes
   * nothing, which leaves the counts exactly as they were.
   */
  readonly extraUnits = input<readonly DownloadUnit[]>([]);
  /**
   * Which recipe the acquire button is drawn with. Defaults to the accent fill,
   * so a view that embeds this component once keeps exactly the button it has
   * today; a view that embeds it several times names the tier at every call
   * site and keeps the fill for the single action that speaks for the screen.
   */
  readonly tier = input<ContainerActionTier>('primary');

  protected readonly canDownload = this.platform.capabilities.canDownload;

  protected readonly acquireButtonClass = computed(() => ACQUIRE_BUTTON_CLASS[this.tier()]);

  private readonly locallyCompleted = signal<ReadonlySet<string>>(new Set());

  protected readonly counts = computed(() =>
    aggregateLessons(
      this.lessons(),
      (entityId) => this.store.transferFor(entityId),
      this.locallyCompleted(),
      this.extraUnits(),
    ),
  );

  /**
   * True while one of this container's actions is in flight.
   *
   * The buttons reflect it as `aria-disabled` rather than as the `disabled`
   * property, so the one that was just pressed keeps the keyboard focus
   * instead of dropping it to the document body. That leaves them clickable,
   * which is why every handler below re-checks this before doing any work:
   * without those checks a second press would enqueue the whole container
   * twice.
   */
  protected readonly busy = signal(false);
  protected readonly actionErrorKey = signal<string | null>(null);

  constructor() {
    // Marks a unit as held locally as soon as its own transfer completes,
    // rather than waiting for the parent screen to re-fetch the whole track.
    effect(() => {
      const ids = [
        ...this.lessons().map((lesson) => lesson.id),
        ...this.extraUnits().map((unit) => unit.id),
      ];
      const current = this.locallyCompleted();
      let next: Set<string> | null = null;
      for (const id of ids) {
        if (id !== null && this.store.rawStateFor(id) === 'DONE' && !current.has(id)) {
          next ??= new Set(current);
          next.add(id);
        }
      }
      if (next) {
        this.locallyCompleted.set(next);
      }
    });
  }

  protected async onDownload(): Promise<void> {
    if (this.busy()) {
      return;
    }
    await this.run(() => this.store.enqueue(this.scope()));
  }

  protected async onPause(): Promise<void> {
    if (this.busy()) {
      return;
    }
    const batchId = this.activeBatchId();
    if (batchId) {
      await this.run(() => this.store.pause(batchId));
    }
  }

  protected async onResume(): Promise<void> {
    if (this.busy()) {
      return;
    }
    const batchId = this.activeBatchId();
    if (batchId) {
      await this.run(() => this.store.resume(batchId));
    }
  }

  protected async onCancel(): Promise<void> {
    if (this.busy()) {
      return;
    }
    const batchId = this.activeBatchId();
    if (batchId) {
      await this.run(() => this.store.cancel(batchId));
    }
  }

  protected async onRetry(): Promise<void> {
    if (this.busy()) {
      return;
    }
    const activeEntityId = this.counts().activeEntityId;
    await this.run(() => this.store.retry(activeEntityId ?? undefined));
  }

  private activeBatchId(): string | null {
    const activeEntityId = this.counts().activeEntityId;
    return activeEntityId ? this.store.batchIdFor(activeEntityId) : null;
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.actionErrorKey.set(null);
    try {
      await action();
    } catch (error) {
      this.actionErrorKey.set(errorKey(error));
    } finally {
      this.busy.set(false);
    }
  }
}

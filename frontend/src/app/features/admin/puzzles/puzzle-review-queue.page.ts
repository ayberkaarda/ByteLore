import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthSession } from '../../../core/auth/auth-session';
import { errorKey } from '../../../core/platform/error-key';
import { AdminPuzzleApiClient } from '../../../core/puzzle/admin-puzzle-api.client';
import type { AdminPuzzle } from '../../../core/puzzle/puzzle-models';
import { DateTimePipe } from '../../../shared/date-time.pipe';
import { Pagination } from '../../../shared/pagination';

const PAGE_SIZE = 20;
const MIN_REASON_LENGTH = 10;

/**
 * The puzzles waiting for a decision, the soonest running day first.
 *
 * A separate queue from the blog's rather than a filter on it, because the
 * two carry different shapes: a reviewer needs the answer line here, and no
 * blog post has one.
 *
 * The decision is offered on the row itself, not only behind a link. A
 * reviewer working a queue makes the same two calls over and over, and
 * sending them through a detail screen and back would cost two navigations
 * per puzzle to learn nothing they did not already see in the row. The link
 * to the full puzzle stays, for the times where the row is not enough —
 * which is every time the decision is not obvious.
 *
 * Approving and rejecting are `ADMIN`-only on the server, so an `EDITOR`
 * sees the queue and the link and no buttons at all, rather than buttons
 * that answer with a refusal.
 */
@Component({
  selector: 'app-puzzle-review-queue-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, DateTimePipe, Pagination],
  templateUrl: './puzzle-review-queue.page.html',
})
export class PuzzleReviewQueuePage {
  private readonly api = inject(AdminPuzzleApiClient);
  private readonly session = inject(AuthSession);

  protected readonly canDecide = this.session.isAdmin;

  protected readonly page = signal(0);
  protected readonly totalPages = signal(1);
  protected readonly items = signal<readonly AdminPuzzle[]>([]);
  protected readonly loading = signal(true);
  protected readonly failureKey = signal<string | null>(null);

  /** The puzzle whose row currently has a decision in flight, if any. */
  protected readonly busyId = signal<string | null>(null);

  /** A failure that belongs to one row rather than to the list. */
  protected readonly rowFailureKey = signal<string | null>(null);
  protected readonly rowFailureId = signal<string | null>(null);

  /** The puzzle whose rejection reason is being written, if any. */
  protected readonly rejectingId = signal<string | null>(null);
  protected readonly reasonDraft = signal('');

  protected readonly reasonTooShort = computed(
    () => this.reasonDraft().trim().length < MIN_REASON_LENGTH,
  );

  private readonly reasonField = viewChild<ElementRef<HTMLTextAreaElement>>('reasonField');

  constructor() {
    void this.load();

    // Focus follows the panel: the reference is a signal, so this runs once
    // the textarea is actually in the document rather than at the moment the
    // flag was set.
    effect(() => {
      const field = this.reasonField();
      if (this.rejectingId() !== null && field) {
        field.nativeElement.focus();
      }
    });
  }

  protected onPageChange(page: number): void {
    this.page.set(page);
    void this.load();
  }

  protected retry(): void {
    void this.load();
  }

  protected async approve(puzzle: AdminPuzzle): Promise<void> {
    if (this.busyId() !== null) {
      return;
    }
    await this.decide(puzzle, 'approve', undefined);
  }

  protected startReject(puzzle: AdminPuzzle): void {
    this.rejectingId.set(puzzle.id);
    this.reasonDraft.set('');
    this.rowFailureKey.set(null);
    this.rowFailureId.set(null);
  }

  protected cancelReject(): void {
    this.rejectingId.set(null);
    this.reasonDraft.set('');
  }

  protected onReasonInput(event: Event): void {
    this.reasonDraft.set((event.target as HTMLTextAreaElement).value);
  }

  protected async confirmReject(puzzle: AdminPuzzle): Promise<void> {
    // Both halves of what the button's unavailable state reflects, checked
    // here as well: the button stays clickable in that state so that it does
    // not drop the focus.
    if (this.busyId() !== null || this.reasonTooShort()) {
      return;
    }
    await this.decide(puzzle, 'reject', this.reasonDraft().trim());
  }

  private async decide(
    puzzle: AdminPuzzle,
    action: 'approve' | 'reject',
    reason: string | undefined,
  ): Promise<void> {
    this.busyId.set(puzzle.id);
    this.rowFailureKey.set(null);
    this.rowFailureId.set(null);
    try {
      await this.api.transitionPuzzle(puzzle.id, action, {
        expectedStatus: puzzle.status,
        reason,
      });
      this.rejectingId.set(null);
      this.reasonDraft.set('');
      // The row has left the queue, so the queue is re-read rather than
      // patched: the page it was on may now be short one row, and the page
      // after it has moved up.
      await this.load();
    } catch (error) {
      this.rowFailureId.set(puzzle.id);
      this.rowFailureKey.set(errorKey(error));
    } finally {
      this.busyId.set(null);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.failureKey.set(null);
    try {
      const result = await this.api.listReviewQueue({ page: this.page(), size: PAGE_SIZE });
      this.items.set(result.items);
      this.totalPages.set(result.totalPages);
    } catch (error) {
      this.failureKey.set(errorKey(error));
    } finally {
      this.loading.set(false);
    }
  }
}

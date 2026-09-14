import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  numberAttribute,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { LocalizedNav } from '../../../core/nav/localized-nav';
import { AdminPuzzleApiClient } from '../../../core/puzzle/admin-puzzle-api.client';
import type { AdminPuzzle, PuzzleStatus } from '../../../core/puzzle/puzzle-models';
import { errorKey } from '../../../core/platform/error-key';
import { DateTimePipe } from '../../../shared/date-time.pipe';
import { Pagination } from '../../../shared/pagination';
import { StatusBadge } from '../../../shared/status-badge';

const PAGE_SIZE = 20;

/** How long typing pauses before a `q` change is sent, so every keystroke is not a request. */
const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS: readonly PuzzleStatus[] = [
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'REJECTED',
];

/** One `field,direction` token per field the server's sort whitelist accepts. */
const SORT_OPTIONS: readonly string[] = [
  'puzzle_date,desc',
  'puzzle_date,asc',
  'updated_at,desc',
  'created_at,desc',
  'title,asc',
];

/**
 * The puzzle authoring list: filter by status, search a title, one sort
 * field, and pagination — all of it in the URL's query params rather than in
 * component state alone, so the browser's back button returns to the exact
 * filtered view somebody left instead of an empty default.
 *
 * Ordered by running day, newest first: a puzzle is scheduled for a date, and
 * "which day is covered and which is not" is the question this list exists to
 * answer.
 */
@Component({
  selector: 'app-puzzle-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, StatusBadge, DateTimePipe, Pagination],
  templateUrl: './puzzle-list.page.html',
})
export class PuzzleListPage {
  /** Prefixes the language segment onto link targets where the build has one. */
  protected readonly nav = inject(LocalizedNav);

  private readonly api = inject(AdminPuzzleApiClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * A query parameter missing from the URL still runs the router's
   * component-input binding and calls the setter with `undefined`, so each
   * transform folds that back onto the value the field already uses to mean
   * "no filter" — or, for `page`, the first page.
   */
  readonly status = input('', { transform: (value: string | undefined) => value ?? '' });
  readonly q = input('', { transform: (value: string | undefined) => value ?? '' });
  readonly sort = input('puzzle_date,desc', {
    transform: (value: string | undefined) => value ?? 'puzzle_date,desc',
  });
  readonly page = input(0, { transform: (value: string | undefined) => numberAttribute(value, 0) });

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly sortOptions = SORT_OPTIONS;

  /** The search box's own draft, which holds every keystroke the query param does not. */
  protected readonly qDraft = signal('');

  protected readonly puzzles = signal<readonly AdminPuzzle[]>([]);
  protected readonly totalPages = signal(0);
  protected readonly loading = signal(true);
  protected readonly failureKey = signal<string | null>(null);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.qDraft.set(this.q());
    });

    effect(() => {
      const status = this.status();
      const q = this.q();
      const sort = this.sort();
      const page = this.page();
      void this.load(status, q, sort, page);
    });

    this.destroyRef.onDestroy(() => {
      if (this.searchTimer !== null) {
        clearTimeout(this.searchTimer);
      }
    });
  }

  protected onStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.navigate({ status: value === '' ? null : value, page: null });
  }

  protected onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.navigate({ sort: value, page: null });
  }

  protected onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.qDraft.set(value);
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.navigate({ q: value.trim() === '' ? null : value, page: null });
    }, SEARCH_DEBOUNCE_MS);
  }

  protected onPageChange(page: number): void {
    this.navigate({ page: page === 0 ? null : String(page) });
  }

  protected retry(): void {
    void this.load(this.status(), this.q(), this.sort(), this.page());
  }

  private async load(status: string, q: string, sort: string, page: number): Promise<void> {
    this.loading.set(true);
    this.failureKey.set(null);
    try {
      const result = await this.api.listPuzzles({
        status: status === '' ? undefined : (status as PuzzleStatus),
        q: q.trim() === '' ? undefined : q.trim(),
        sort: sort === '' ? undefined : [sort],
        page,
        size: PAGE_SIZE,
      });
      this.puzzles.set(result.items);
      this.totalPages.set(result.totalPages);
    } catch (error) {
      this.failureKey.set(errorKey(error));
    } finally {
      this.loading.set(false);
    }
  }

  private navigate(patch: Readonly<Record<string, string | null>>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: 'merge',
    });
  }
}

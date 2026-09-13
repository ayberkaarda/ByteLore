import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthSession } from '../../../core/auth/auth-session';
import { errorKey } from '../../../core/platform/error-key';
import { PlatformError } from '../../../core/platform/errors';
import { AdminPuzzleApiClient } from '../../../core/puzzle/admin-puzzle-api.client';
import type { AdminPuzzle, UpdatePuzzleInput } from '../../../core/puzzle/puzzle-models';
import { StatusBadge } from '../../../shared/status-badge';
import { PuzzleCode, codeLines } from '../../puzzle/puzzle-code';
import {
  availablePuzzleActions,
  canEditPuzzle,
  puzzleReasonRequired,
  type PuzzleLifecycleAction,
} from './puzzle-lifecycle';

const TITLE_MAX_LENGTH = 200;
const PROMPT_MAX_LENGTH = 4000;
const LANGUAGE_MAX_LENGTH = 40;
const CODE_MAX_LENGTH = 20_000;
const EXPLANATION_MAX_LENGTH = 4000;
const MIN_REASON_LENGTH = 10;

/** The server's own tag vocabulary, so a rejected language is caught before the request. */
const LANGUAGE_PATTERN = /^[a-z0-9][a-z0-9+#._-]*$/;

/** A plain calendar date, the shape a `date` input produces and the API expects. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Create-or-edit screen for one daily puzzle.
 *
 * With no `:id` (the `puzzles/new` route) this is a create form, which always
 * produces a `DRAFT` — the server never accepts a status from a client,
 * because the only way to `PUBLISHED` is through review. With an `:id` it
 * loads that puzzle and becomes an editor plus the lifecycle action bar for
 * whatever transitions the signed-in role can take on it.
 *
 * The form is built from plain signals with one `computed` error key per
 * field, the same way the blog editor is, rather than from a forms module: a
 * validity rule here is a statement about one value, and reading it as one
 * expression next to the value is worth more than the machinery that would
 * otherwise carry it.
 *
 * The preview is the player's own listing component, and it is live rather
 * than read-only: clicking a line in it sets the answer. That is the one
 * thing this screen most needs to get right — an answer line is a number
 * about a listing, and a number typed into a box beside a listing is the
 * easiest thing on this form to get off by one.
 */
@Component({
  selector: 'app-puzzle-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, StatusBadge, PuzzleCode],
  templateUrl: './puzzle-editor.page.html',
})
export class PuzzleEditorPage {
  private readonly api = inject(AdminPuzzleApiClient);
  private readonly session = inject(AuthSession);
  private readonly router = inject(Router);

  /** Absent on the `puzzles/new` route; present on `puzzles/:id/edit`. */
  readonly id = input<string>();

  protected readonly isCreateMode = computed(() => this.id() === undefined);

  protected readonly loading = signal(true);
  protected readonly loadFailureKey = signal<string | null>(null);

  /** The last-loaded/last-saved server record; null in create mode until the first save. */
  protected readonly puzzle = signal<AdminPuzzle | null>(null);
  private loadedId: string | null = null;

  // ---- Form fields, independent of `puzzle` so a version conflict never overwrites them -------
  protected readonly puzzleDate = signal('');
  protected readonly title = signal('');
  protected readonly promptMarkdown = signal('');
  protected readonly language = signal('');
  protected readonly code = signal('');
  protected readonly buggyLine = signal('');
  protected readonly explanationMarkdown = signal('');
  protected readonly attempted = signal(false);

  protected readonly saving = signal(false);
  protected readonly saveFailureKey = signal<string | null>(null);

  /** What just went right, for the polite live region in the template. */
  protected readonly outcomeKey = signal<string | null>(null);

  private readonly reasonField = viewChild<ElementRef<HTMLTextAreaElement>>('reasonField');
  private readonly actionGroup = viewChild<ElementRef<HTMLElement>>('actionGroup');

  /**
   * The action whose button opened the reason panel, held so focus can be put
   * back on it: opening the panel destroys that button, and a destroyed
   * element takes the focus with it to the top of the document.
   */
  private readonly focusActionAfterCancel = signal<PuzzleLifecycleAction | null>(null);

  protected readonly role = computed(() => this.session.role());

  /** How many lines the listing in the form has, by the rule the server counts with. */
  protected readonly lineCount = computed(() => codeLines(this.code()).length);

  /** The answer line as a number, or null while the field is empty or not a whole number. */
  protected readonly buggyLineNumber = computed<number | null>(() => {
    const raw = this.buggyLine().trim();
    if (raw === '') {
      return null;
    }
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : null;
  });

  protected readonly editable = computed(() => {
    const current = this.puzzle();
    return current === null || canEditPuzzle(current);
  });

  protected readonly actions = computed<readonly PuzzleLifecycleAction[]>(() => {
    const current = this.puzzle();
    const role = this.role();
    if (current === null || role === null) {
      return [];
    }
    return availablePuzzleActions(current, role);
  });

  // ---- Validation ----------------------------------------------------------------------------

  protected readonly puzzleDateErrorKey = computed<string | null>(() => {
    const value = this.puzzleDate().trim();
    if (value === '') {
      return 'admin.puzzles.editor.error.dateRequired';
    }
    return DATE_PATTERN.test(value) ? null : 'admin.puzzles.editor.error.dateInvalid';
  });

  protected readonly titleErrorKey = computed<string | null>(() => {
    const value = this.title().trim();
    if (value === '') {
      return 'admin.puzzles.editor.error.titleRequired';
    }
    return value.length > TITLE_MAX_LENGTH ? 'admin.puzzles.editor.error.titleLength' : null;
  });

  protected readonly promptErrorKey = computed<string | null>(() =>
    this.promptMarkdown().length > PROMPT_MAX_LENGTH
      ? 'admin.puzzles.editor.error.promptLength'
      : null,
  );

  protected readonly languageErrorKey = computed<string | null>(() => {
    const value = this.language().trim();
    if (value === '') {
      return 'admin.puzzles.editor.error.languageRequired';
    }
    if (value.length > LANGUAGE_MAX_LENGTH) {
      return 'admin.puzzles.editor.error.languageLength';
    }
    return LANGUAGE_PATTERN.test(value) ? null : 'admin.puzzles.editor.error.languagePattern';
  });

  protected readonly codeErrorKey = computed<string | null>(() => {
    const value = this.code();
    if (value.trim() === '') {
      return 'admin.puzzles.editor.error.codeRequired';
    }
    return value.length > CODE_MAX_LENGTH ? 'admin.puzzles.editor.error.codeLength' : null;
  });

  protected readonly buggyLineErrorKey = computed<string | null>(() => {
    const line = this.buggyLineNumber();
    if (line === null) {
      return 'admin.puzzles.editor.error.buggyLineRequired';
    }
    const count = this.lineCount();
    return line >= 1 && line <= count ? null : 'admin.puzzles.editor.error.buggyLineRange';
  });

  protected readonly explanationErrorKey = computed<string | null>(() => {
    const value = this.explanationMarkdown().trim();
    if (value === '') {
      return 'admin.puzzles.editor.error.explanationRequired';
    }
    return value.length > EXPLANATION_MAX_LENGTH
      ? 'admin.puzzles.editor.error.explanationLength'
      : null;
  });

  protected readonly formValid = computed(
    () =>
      this.puzzleDateErrorKey() === null &&
      this.titleErrorKey() === null &&
      this.promptErrorKey() === null &&
      this.languageErrorKey() === null &&
      this.codeErrorKey() === null &&
      this.buggyLineErrorKey() === null &&
      this.explanationErrorKey() === null,
  );

  // ---- Lifecycle actions ---------------------------------------------------------------------

  protected readonly pendingAction = signal<PuzzleLifecycleAction | null>(null);
  protected readonly reasonDraft = signal('');
  protected readonly transitioning = signal(false);
  protected readonly transitionFailureKey = signal<string | null>(null);

  protected readonly reasonTooShort = computed(
    () => this.reasonDraft().trim().length < MIN_REASON_LENGTH,
  );

  constructor() {
    effect(() => {
      const field = this.reasonField();
      if (this.pendingAction() !== null && field) {
        field.nativeElement.focus();
      }
    });

    effect(() => {
      const action = this.focusActionAfterCancel();
      const group = this.actionGroup();
      if (action === null || !group) {
        return;
      }
      this.focusActionAfterCancel.set(null);
      group.nativeElement.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.focus();
    });

    effect(() => {
      const id = this.id();
      if (id === undefined) {
        this.loading.set(false);
        return;
      }
      if (id === this.loadedId) {
        return;
      }
      void this.loadExisting(id);
    });
  }

  protected retryLoad(): void {
    const id = this.id();
    if (id !== undefined) {
      void this.loadExisting(id);
    }
  }

  protected onDateInput(event: Event): void {
    this.puzzleDate.set((event.target as HTMLInputElement).value);
  }

  protected onTitleInput(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
  }

  protected onPromptInput(event: Event): void {
    this.promptMarkdown.set((event.target as HTMLTextAreaElement).value);
  }

  protected onLanguageInput(event: Event): void {
    this.language.set((event.target as HTMLInputElement).value);
  }

  protected onCodeInput(event: Event): void {
    this.code.set((event.target as HTMLTextAreaElement).value);
  }

  protected onBuggyLineInput(event: Event): void {
    this.buggyLine.set((event.target as HTMLInputElement).value);
  }

  protected onExplanationInput(event: Event): void {
    this.explanationMarkdown.set((event.target as HTMLTextAreaElement).value);
  }

  protected onReasonInput(event: Event): void {
    this.reasonDraft.set((event.target as HTMLTextAreaElement).value);
  }

  /** Picking the line in the preview is the same edit as typing its number. */
  protected onPreviewLineSelect(line: number): void {
    if (!this.editable()) {
      return;
    }
    this.buggyLine.set(String(line));
  }

  protected async onSave(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.attempted.set(true);
    if (!this.formValid()) {
      return;
    }
    this.saving.set(true);
    this.saveFailureKey.set(null);
    this.outcomeKey.set(null);
    try {
      if (this.isCreateMode()) {
        const created = await this.api.createPuzzle({
          puzzleDate: this.puzzleDate().trim(),
          title: this.title().trim(),
          promptMarkdown: this.promptMarkdown().trim() === '' ? undefined : this.promptMarkdown(),
          language: this.language().trim(),
          code: this.code(),
          buggyLine: this.buggyLineNumber() ?? 1,
          explanationMarkdown: this.explanationMarkdown(),
        });
        this.applyPuzzle(created);
        await this.router.navigate(['/admin/puzzles', created.id, 'edit']);
      } else {
        const current = this.puzzle();
        if (current === null) {
          return;
        }
        const updated = await this.api.updatePuzzle(current.id, this.buildUpdatePayload(current));
        this.applyPuzzle(updated);
        this.outcomeKey.set('admin.puzzles.editor.saved');
      }
    } catch (error) {
      if (error instanceof PlatformError && error.code === 'VERSION_CONFLICT') {
        await this.refreshServerFieldsAfterConflict();
      }
      this.saveFailureKey.set(errorKey(error));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Only what changed, plus the version.
   *
   * `promptMarkdown` is the one field with a third state: an empty string is
   * sent rather than omitted when a prompt that existed has been cleared,
   * because omitting it means "leave it alone" and would silently keep a
   * prompt the author just deleted.
   */
  private buildUpdatePayload(current: AdminPuzzle): UpdatePuzzleInput {
    const payload: {
      version: number;
      puzzleDate?: string;
      title?: string;
      promptMarkdown?: string;
      language?: string;
      code?: string;
      buggyLine?: number;
      explanationMarkdown?: string;
    } = { version: current.version };

    const date = this.puzzleDate().trim();
    if (date !== current.puzzleDate) {
      payload.puzzleDate = date;
    }
    const title = this.title().trim();
    if (title !== current.title) {
      payload.title = title;
    }
    const prompt = this.promptMarkdown();
    if (prompt !== (current.promptMarkdown ?? '')) {
      payload.promptMarkdown = prompt.trim() === '' ? '' : prompt;
    }
    const language = this.language().trim();
    if (language !== current.language) {
      payload.language = language;
    }
    const code = this.code();
    if (code !== current.code) {
      payload.code = code;
    }
    const line = this.buggyLineNumber();
    if (line !== null && line !== current.buggyLine) {
      payload.buggyLine = line;
    }
    const explanation = this.explanationMarkdown();
    if (explanation !== current.explanationMarkdown) {
      payload.explanationMarkdown = explanation;
    }

    return payload;
  }

  protected async onAction(action: PuzzleLifecycleAction): Promise<void> {
    if (this.transitioning()) {
      return;
    }
    this.transitionFailureKey.set(null);
    if (puzzleReasonRequired(action)) {
      this.pendingAction.set(action);
      this.reasonDraft.set('');
      return;
    }
    await this.runAction(action, undefined);
  }

  protected async confirmPendingAction(): Promise<void> {
    const action = this.pendingAction();
    if (action === null || this.transitioning() || this.reasonTooShort()) {
      return;
    }
    await this.runAction(action, this.reasonDraft().trim());
  }

  protected cancelPendingAction(): void {
    this.focusActionAfterCancel.set(this.pendingAction());
    this.pendingAction.set(null);
    this.reasonDraft.set('');
  }

  private async runAction(
    action: PuzzleLifecycleAction,
    reason: string | undefined,
  ): Promise<void> {
    const current = this.puzzle();
    if (current === null) {
      return;
    }
    this.transitioning.set(true);
    this.transitionFailureKey.set(null);
    this.outcomeKey.set(null);
    try {
      if (action === 'delete') {
        await this.api.deletePuzzle(current.id);
        await this.router.navigateByUrl('/admin/puzzles');
        return;
      }
      const updated = await this.api.transitionPuzzle(current.id, action, {
        expectedStatus: current.status,
        reason,
      });
      this.applyPuzzle(updated);
      this.pendingAction.set(null);
      this.reasonDraft.set('');
      this.outcomeKey.set('admin.puzzles.editor.transitionApplied');
    } catch (error) {
      if (error instanceof PlatformError && error.code === 'VERSION_CONFLICT') {
        await this.refreshServerFieldsAfterConflict();
      }
      this.transitionFailureKey.set(errorKey(error));
    } finally {
      this.transitioning.set(false);
    }
  }

  /**
   * Refreshes `puzzle` (status, version, timestamps) after a
   * `VERSION_CONFLICT` without touching the form signals — the text the
   * author is looking at stays exactly as they left it, because overwriting
   * it with the server's copy would discard whatever they had not saved.
   */
  private async refreshServerFieldsAfterConflict(): Promise<void> {
    const current = this.puzzle();
    if (current === null) {
      return;
    }
    try {
      this.puzzle.set(await this.api.getPuzzle(current.id));
    } catch {
      // The save/transition error already surfaced; leaving the stale record
      // in place beats losing the form's unsaved edits over a second failure.
    }
  }

  private async loadExisting(id: string): Promise<void> {
    this.loading.set(true);
    this.loadFailureKey.set(null);
    try {
      const loaded = await this.api.getPuzzle(id);
      this.applyPuzzle(loaded);
      this.loadedId = id;
    } catch (error) {
      this.loadFailureKey.set(errorKey(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** Adopts a server response as the new baseline, record and form fields alike. */
  private applyPuzzle(loaded: AdminPuzzle): void {
    this.puzzle.set(loaded);
    this.puzzleDate.set(loaded.puzzleDate);
    this.title.set(loaded.title);
    this.promptMarkdown.set(loaded.promptMarkdown ?? '');
    this.language.set(loaded.language);
    this.code.set(loaded.code);
    this.buggyLine.set(String(loaded.buggyLine));
    this.explanationMarkdown.set(loaded.explanationMarkdown);
  }
}

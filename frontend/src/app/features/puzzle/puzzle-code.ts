import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  PendingTasks,
  computed,
  effect,
  inject,
  input,
  output,
  viewChildren,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { MarkdownService } from '../../core/markdown/markdown.service';
import type { ResolvedTheme } from '../../core/platform/models';
import { ThemeService } from '../../core/theme/theme.service';

/** What a row is marked as, which is the only thing colour says on this listing. */
export type PuzzleLineMark = 'none' | 'selected' | 'correct' | 'wrong';

export interface PuzzleCodeLine {
  /** One-based, the number the server validates a click against. */
  readonly number: number;
  readonly mark: PuzzleLineMark;
}

/**
 * Splits a listing the way the server counts it.
 *
 * The rule is copied deliberately rather than derived from the line count the
 * API sends: this component also renders code an author is still typing,
 * which no server has counted yet, and two rules that could disagree would
 * put an author's answer on a line a player cannot pick.
 *
 * A trailing newline terminates the last line rather than opening an empty
 * one — which is how an editor numbers a file and therefore how a player sees
 * it. Line endings are folded to LF first: the API stores code that way, and
 * a textarea reports its value that way, but a value assembled anywhere else
 * must not be allowed to shift every number below it by one row.
 */
export function codeLines(code: string): readonly string[] {
  if (code === '') {
    return [];
  }
  const lines = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/** Distinguishes two listings on one screen, since radio grouping is by name. */
let groupCounter = 0;

/**
 * A syntax-highlighted listing whose lines can be picked, one at a time.
 *
 * The highlighting is done for the whole block in one pass and then taken
 * apart, rather than per line. A listing is not a list of independent lines:
 * a block comment, a multi-line string or a template literal spans several of
 * them, and highlighting each line on its own restarts the grammar at every
 * newline and mis-colours everything after the first such construct. So the
 * highlighter is handed the whole listing, and its own per-line wrappers are
 * then rehomed into the selectable rows below — the markup it produced is
 * moved, never rebuilt.
 *
 * Selection is a native radio group rather than a row of buttons: picking one
 * line out of many is exactly what a radio group is, and it brings arrow-key
 * navigation, a single tab stop and an announced "n of m" position for free,
 * where a list of buttons would need every one of those written by hand and
 * would put thirty tab stops between a reader and the submit button. The
 * inputs are visually hidden; the row around each one is the label, so the
 * whole line — number and code — is the click target.
 *
 * What is inserted is sanitized before it is inserted, never after: the
 * markup comes from `MarkdownService.highlightSanitized`, which runs the
 * highlighter's output through DOMPurify. It is then read with `DOMParser`,
 * which builds an inert document that executes nothing, and only the line
 * elements are imported into the live one. If the highlighter is unavailable
 * at all the rows are filled with `textContent` instead, so the listing is
 * still readable, still numbered and still selectable — just not coloured.
 */
@Component({
  selector: 'app-puzzle-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './puzzle-code.html',
})
export class PuzzleCode {
  private readonly markdown = inject(MarkdownService);
  private readonly theme = inject(ThemeService);
  private readonly document = inject(DOCUMENT);

  /**
   * Highlighting a listing is work the screen is not finished without: until
   * it lands, the rows are numbered and empty. Registering it keeps the
   * application unstable for its duration, so anything that waits for
   * stability — a test, a server-side render — waits for the code to be in
   * the listing rather than photographing the gutter on its own.
   */
  private readonly pendingTasks = inject(PendingTasks);

  readonly code = input.required<string>();
  readonly language = input.required<string>();

  /** The line this player has picked, or null before they pick one. */
  readonly selectedLine = input<number | null>(null);

  /** The answer, once it may be shown. Null keeps the listing a question. */
  readonly buggyLine = input<number | null>(null);

  /** True once the attempt is spent and the listing is a record rather than a choice. */
  readonly locked = input(false);

  readonly lineSelect = output<number>();

  protected readonly groupName = `puzzle-line-${(groupCounter += 1)}`;

  protected readonly lines = computed<readonly PuzzleCodeLine[]>(() => {
    const selected = this.selectedLine();
    const buggy = this.buggyLine();
    return codeLines(this.code()).map((_, index) => ({
      number: index + 1,
      mark: markFor(index + 1, selected, buggy),
    }));
  });

  private readonly rows = viewChildren<ElementRef<HTMLElement>>('row');

  constructor() {
    // Re-runs when the listing changes and when the palette does: a code
    // block's colours are baked into the markup the highlighter produced, so
    // without the second dependency a listing stays light inside a dark page.
    effect(() => {
      const code = this.code();
      const language = this.language();
      const theme = this.theme.resolved();
      void this.pendingTasks.run(() => this.render(code, language, theme));
    });
  }

  protected onSelect(line: number): void {
    if (this.locked()) {
      return;
    }
    this.lineSelect.emit(line);
  }

  private async render(code: string, language: string, theme: ResolvedTheme): Promise<void> {
    const html = await this.markdown.highlightSanitized(code, language, theme);
    // The await is what makes this safe to run without waiting on a render
    // hook: change detection is synchronous, so by the time this continuation
    // runs the rows for this listing are in the document.
    this.distribute(html, codeLines(code));
  }

  private distribute(html: string, plain: readonly string[]): void {
    const rows = this.rows();
    if (rows.length === 0) {
      return;
    }

    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const source = parsed.querySelector('code');
    const highlightedLines =
      source === null
        ? []
        : Array.from(source.children).filter((child) => child.classList.contains('line'));

    if (highlightedLines.length === rows.length) {
      rows.forEach((row, index) => {
        row.nativeElement.replaceChildren(this.document.importNode(highlightedLines[index], true));
      });
      return;
    }

    // No highlighter, or markup that does not line up with the gutter the
    // server validates against. Either way the source is the content and a
    // mis-numbered listing would be worse than an uncoloured one, so the rows
    // are filled as text — escaped by the DOM rather than by a hand-written
    // escape, because it never becomes markup in the first place.
    rows.forEach((row, index) => {
      row.nativeElement.textContent = plain[index] ?? '';
    });
  }
}

/**
 * What one row is marked as.
 *
 * Before the answer is known there is only the pick. Afterwards the answer
 * always carries the `correct` mark, whether or not it is also what the
 * player chose, and a pick that missed is marked separately — so a wrong
 * answer shows both lines at once and says which was which, instead of
 * quietly moving the highlight and leaving the reader to notice.
 */
function markFor(line: number, selected: number | null, buggy: number | null): PuzzleLineMark {
  if (buggy === null) {
    return line === selected ? 'selected' : 'none';
  }
  if (line === buggy) {
    return 'correct';
  }
  return line === selected ? 'wrong' : 'none';
}

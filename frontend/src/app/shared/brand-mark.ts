import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The ByteLore mark: a pair of square brackets with a proofreader's caret
 * rising between them. The brackets are a unit of code, a byte, one thing to
 * know; the caret is the mark a proofreader makes where something is to be
 * inserted. Together they read as the product's promise: room for one more
 * thing in what you already know.
 *
 * Drawn inline rather than loaded as an image so it takes its colours from the
 * theme tokens and follows a palette switch without a second asset. The
 * brackets are the text ink and the caret is the accent, so the mark keeps its
 * contrast on the page in both palettes. Built from filled shapes on a 32-unit
 * grid with whole-unit stems, so it stays crisp at the 16px a browser tab
 * draws it at.
 *
 * It is always decorative: wherever it appears the product name is written
 * beside it, or the surrounding element already carries an accessible name, so
 * the mark is hidden from assistive technology and never announced twice. Its
 * size comes from the host element's classes.
 */
@Component({
  selector: 'app-brand-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block shrink-0 text-text', 'aria-hidden': 'true' },
  template: `
    <svg class="block h-full w-full" viewBox="0 0 32 32" focusable="false">
      <path fill="currentColor" d="M4 4h8v3.5H7.5v17H12V28H4Z" />
      <path fill="currentColor" d="M28 4h-8v3.5h4.5v17H20V28h8Z" />
      <path class="fill-accent" d="M16 9.5 22.5 21.5h-4.1L16 16.9l-2.4 4.6H9.5Z" />
    </svg>
  `,
})
export class BrandMark {}

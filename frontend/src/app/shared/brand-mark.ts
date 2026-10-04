import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The ByteLore mark: a petrol tile carrying three bars that step inward like
 * nested lines of code, the shortest one followed by a cursor block. Layered
 * knowledge, still being written.
 *
 * Drawn inline rather than loaded as an image so it takes its colours from the
 * theme tokens and follows a palette switch without a second asset. The tile is
 * the accent colour and the bars are the text colour that sits on the accent,
 * the same pairing a primary button uses, so the mark keeps its contrast in
 * both palettes.
 *
 * It is always decorative: wherever it appears the product name is written
 * beside it, or the surrounding element already carries an accessible name, so
 * the mark is hidden from assistive technology and never announced twice. Its
 * size comes from the host element's classes.
 */
@Component({
  selector: 'app-brand-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block shrink-0 text-accent', 'aria-hidden': 'true' },
  template: `
    <svg class="block h-full w-full" viewBox="0 0 32 32" focusable="false">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <rect class="fill-accent-contrast" x="7" y="8.5" width="18" height="3.5" rx="1.75" />
      <rect class="fill-accent-contrast" x="11" y="14.25" width="14" height="3.5" rx="1.75" />
      <rect class="fill-accent-contrast" x="15" y="20" width="5" height="3.5" rx="1.75" />
      <rect
        class="fill-accent-contrast opacity-60"
        x="22"
        y="20"
        width="3"
        height="3.5"
        rx="0.75"
      />
    </svg>
  `,
})
export class BrandMark {}

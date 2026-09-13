import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * The two entity kinds a download row can hold. Unlike `StateGlyphKind`
 * (`./state-glyph.ts`), this union carries no meaning of its own beyond
 * "which shape" — a lesson and a mind map are never distinguished by colour,
 * only by outline, so there is no colour table here to keep in step with it.
 */
export type EntityGlyphKind = 'lesson' | 'mindMap';

/**
 * Reached only when every member of `EntityGlyphKind` has already been
 * matched above it in the caller's `switch`. A kind added to the union
 * without a matching case here would otherwise draw nothing — typing the
 * parameter `never` turns that gap into a compile error at the point the
 * union grows, the cheapest point to catch it.
 */
function assertNever(value: never): never {
  throw new Error(`Unhandled entity glyph kind: ${String(value)}`);
}

/**
 * The stroke geometry for one kind, relative to a 16x16 viewBox. A mind map
 * draws three linked circles; a lesson draws a folded-corner document. The
 * two never share a stroke, so there is no ring shared between them the way
 * `completed`/`failed` share one in `StateGlyph`.
 */
export interface EntityGlyphShape {
  readonly circles?: readonly { readonly cx: number; readonly cy: number; readonly r: number }[];
  readonly paths: readonly string[];
}

/**
 * Exported alongside the component, for the same reason `state-glyph.ts`
 * exports `shapeFor`: a second caller drawing its own `<svg>` can read the
 * geometry without a second viewport around it, and a hand-copied path
 * string in that caller would stop matching this one the first time either
 * is adjusted.
 */
export function shapeFor(kind: EntityGlyphKind): EntityGlyphShape {
  switch (kind) {
    case 'mindMap':
      return {
        circles: [
          { cx: 4, cy: 4.5, r: 1.3 },
          { cx: 12, cy: 4.5, r: 1.3 },
          { cx: 8, cy: 12, r: 1.3 },
        ],
        paths: ['M4.9 5.5 7.3 11', 'M11.1 5.5 8.7 11', 'M5.3 4.5h5.4'],
      };
    case 'lesson':
      return {
        paths: [
          'M4.5 2.5h4.5l2 2v8.5a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5Z',
          'M9 2.5v2h2',
          'M6 8.7h4',
          'M6 10.7h4',
        ],
      };
    default:
      return assertNever(kind);
  }
}

/**
 * The translation key that says the kind in words, for the screen-reader
 * text next to the drawing. Both keys already exist in the catalogue — this
 * component reads them rather than adding a word of its own.
 */
const KIND_LABEL_KEY: Record<EntityGlyphKind, string> = {
  lesson: 'downloads.entityLesson',
  mindMap: 'downloads.entityMindMap',
};

/**
 * A small mark for "this row is a lesson" or "this row is a mind map".
 *
 * Extracted from two hand-copied `@if`/`@else` blocks in `downloads.page.html`
 * that drew the same two shapes for the active batch list and the downloaded
 * groups below it — one source for one drawing.
 *
 * Follows `StateGlyph`'s pattern (`./state-glyph.ts`): the drawing is inline,
 * painted in `currentColor` so it takes the muted text colour it sits in
 * without a second definition per theme, marked `aria-hidden` so it carries
 * no meaning of its own, and paired with a screen-reader-only span that says
 * the kind in words — a mark whose meaning depended on a sibling element the
 * call site remembered to add would lose it the first time somebody copied
 * just the icon.
 */
@Component({
  selector: 'app-entity-glyph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: { class: 'inline-flex items-center text-text-muted' },
  template: `
    <svg
      class="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      [attr.data-testid]="'entity-glyph-' + kind()"
    >
      @for (c of shape().circles ?? []; track $index) {
        <circle [attr.cx]="c.cx" [attr.cy]="c.cy" [attr.r]="c.r" />
      }
      @for (d of shape().paths; track d) {
        <path [attr.d]="d" />
      }
    </svg>
    <span class="sr-only">{{ labelKey() | translate }}</span>
  `,
})
export class EntityGlyph {
  readonly kind = input.required<EntityGlyphKind>();

  protected readonly shape = computed(() => shapeFor(this.kind()));
  protected readonly labelKey = computed(() => KIND_LABEL_KEY[this.kind()]);
}

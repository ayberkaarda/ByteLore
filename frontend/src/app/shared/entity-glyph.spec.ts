import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

import { BundledTranslateLoader } from '../core/i18n/translations';
import { EntityGlyph, type EntityGlyphKind, shapeFor } from './entity-glyph';

const ALL_KINDS: readonly EntityGlyphKind[] = ['lesson', 'mindMap'];

describe('EntityGlyph', () => {
  let translate: TranslateService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService({
          loader: BundledTranslateLoader,
          fallbackLang: 'en',
          lang: 'en',
        }),
      ],
    });
    translate = TestBed.inject(TranslateService);
    await firstValueFrom(translate.use('en'));
  });

  async function render(kind: EntityGlyphKind) {
    const fixture = TestBed.createComponent(EntityGlyph);
    (fixture.componentRef as ComponentRef<EntityGlyph>).setInput('kind', kind);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('draws the lesson shape: a folded-corner document, no circles', async () => {
    const element = (await render('lesson')).nativeElement as HTMLElement;
    const svg = element.querySelector<SVGElement>('[data-testid="entity-glyph-lesson"]');
    expect(svg).not.toBeNull();

    const drawn = Array.from(svg!.querySelectorAll('path')).map((path) => path.getAttribute('d'));
    expect(drawn).toEqual([...shapeFor('lesson').paths]);
    expect(svg!.querySelectorAll('circle').length).toBe(0);
  });

  it('draws the mind map shape: three linked circles', async () => {
    const element = (await render('mindMap')).nativeElement as HTMLElement;
    const svg = element.querySelector<SVGElement>('[data-testid="entity-glyph-mindMap"]');
    expect(svg).not.toBeNull();

    const circles = Array.from(svg!.querySelectorAll('circle')).map((circle) => ({
      cx: circle.getAttribute('cx'),
      cy: circle.getAttribute('cy'),
      r: circle.getAttribute('r'),
    }));
    expect(circles).toEqual(
      shapeFor('mindMap').circles!.map((c) => ({
        cx: String(c.cx),
        cy: String(c.cy),
        r: String(c.r),
      })),
    );

    const drawn = Array.from(svg!.querySelectorAll('path')).map((path) => path.getAttribute('d'));
    expect(drawn).toEqual([...shapeFor('mindMap').paths]);
  });

  it('hides the drawing from assistive technology and names the kind in a sibling span', async () => {
    const element = (await render('lesson')).nativeElement as HTMLElement;
    const svg = element.querySelector('[data-testid="entity-glyph-lesson"]')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');

    const label = element.querySelector('.sr-only');
    expect(label?.textContent?.trim()).toBe(translate.instant('downloads.entityLesson'));
    expect(label?.textContent?.trim()).not.toBe('downloads.entityLesson');
  });

  it('names the mind map kind in words', async () => {
    const element = (await render('mindMap')).nativeElement as HTMLElement;
    const label = element.querySelector('.sr-only');
    expect(label?.textContent?.trim()).toBe(translate.instant('downloads.entityMindMap'));
  });

  it('takes its colour from the surrounding text colour rather than a literal', async () => {
    const element = (await render('lesson')).nativeElement as HTMLElement;
    const svg = element.querySelector<SVGElement>('[data-testid="entity-glyph-lesson"]')!;
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(element.getAttribute('class')).toContain('text-text-muted');
  });

  it('renders in the active interface language', async () => {
    const fixture = await render('mindMap');
    await firstValueFrom(translate.use('de'));
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.sr-only')?.textContent?.trim()).toBe(
      translate.instant('downloads.entityMindMap'),
    );
  });

  it('draws each kind with its own outline', async () => {
    const signatures = new Set<string>();
    for (const kind of ALL_KINDS) {
      const element = (await render(kind)).nativeElement as HTMLElement;
      const svg = element.querySelector(`[data-testid="entity-glyph-${kind}"]`)!;
      const signature = Array.from(svg.querySelectorAll('circle, path'))
        .map((node) => node.outerHTML)
        .join('|');
      signatures.add(signature);
    }
    expect(signatures.size).toBe(ALL_KINDS.length);
  });
});

/**
 * The geometry on its own, without the component around it — mirrors
 * `state-glyph.spec.ts`'s `shapeFor` block. Nothing in this codebase draws
 * these shapes on a second canvas today, but the export exists for the same
 * reason `StateGlyph`'s does, so its shape is pinned here too.
 */
describe('shapeFor', () => {
  it('gives every kind at least one stroke to draw', () => {
    for (const kind of ALL_KINDS) {
      const shape = shapeFor(kind);
      expect(shape.paths.length).toBeGreaterThan(0);
      for (const d of shape.paths) {
        expect(d.trim()).not.toBe('');
      }
    }
  });

  it('gives the mind map exactly three circles and the lesson none', () => {
    expect(shapeFor('mindMap').circles).toHaveLength(3);
    expect(shapeFor('lesson').circles).toBeUndefined();
  });
});

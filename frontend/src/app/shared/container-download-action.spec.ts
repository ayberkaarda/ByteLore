import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { FakePlatformService } from '../../testing/fake-platform.service';
import type { DownloadUnit } from '../core/library/aggregate';
import { LocaleService } from '../core/i18n/locale.service';
import { BundledTranslateLoader } from '../core/i18n/translations';
import { contentAvailability } from '../core/platform/models';
import type { Availability, LessonSummary } from '../core/platform/models';
import { PlatformService } from '../core/platform/platform.service';
import { ContainerDownloadAction, type ContainerActionTier } from './container-download-action';

function lesson(id: string, availability: Availability): LessonSummary {
  return {
    id,
    slug: id,
    title: id,
    difficulty: null,
    estimatedMinutes: null,
    order: 0,
    availability: contentAvailability(availability),
    translation: { locale: 'en', requestedLocale: 'en', isFallback: false },
  };
}

function mindMap(availability: Availability): DownloadUnit {
  return { id: 'map-1', availability: contentAvailability(availability) };
}

describe('ContainerDownloadAction', () => {
  let fake: FakePlatformService;

  beforeEach(async () => {
    fake = new FakePlatformService();
    fake.capabilities = { canDownload: true, hasLocalStore: true };

    TestBed.configureTestingModule({
      providers: [
        { provide: PlatformService, useValue: fake },
        provideTranslateService({
          loader: BundledTranslateLoader,
          fallbackLang: 'en',
          lang: 'en',
        }),
      ],
    });
    await TestBed.inject(LocaleService).initialize('en');
  });

  function render(
    lessons: readonly LessonSummary[],
    extraUnits: readonly DownloadUnit[] = [],
    // Left unset rather than defaulted here, so the tests below that say
    // nothing about the tier go through the component's own default.
    tier?: ContainerActionTier,
  ) {
    const fixture = TestBed.createComponent(ContainerDownloadAction);
    fixture.componentRef.setInput('scope', { kind: 'TRACK', id: 'track-1' });
    fixture.componentRef.setInput('title', 'Signals');
    fixture.componentRef.setInput('lessons', lessons);
    fixture.componentRef.setInput('extraUnits', extraUnits);
    if (tier) {
      fixture.componentRef.setInput('tier', tier);
    }
    fixture.detectChanges();
    return fixture;
  }

  function wrapper(fixture: ReturnType<typeof render>): HTMLElement {
    const element = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="container-download-action"]',
    );
    if (element === null) {
      throw new Error('Container action wrapper not found.');
    }
    return element as HTMLElement;
  }

  const fourDownloaded = [
    lesson('lesson-1', 'DOWNLOADED'),
    lesson('lesson-2', 'DOWNLOADED'),
    lesson('lesson-3', 'DOWNLOADED'),
    lesson('lesson-4', 'DOWNLOADED'),
  ];

  it('counts a missing mind map as a fifth unit and keeps offering the download', () => {
    const fixture = render(fourDownloaded, [mindMap('NOT_DOWNLOADED')]);
    const element = wrapper(fixture);

    expect(element.textContent).toContain('4 of 5 downloaded');

    const button = element.querySelector('button');
    expect(button).not.toBeNull();
    // The visible word, plus the container's title carried in a
    // screen-reader-only span so the accessible name says which container this
    // button is for without replacing the words a person can read.
    expect(button?.textContent?.trim()).toBe('Download Signals');
    expect(element.textContent).not.toContain('Downloaded (');
  });

  it('falls back to the accent fill when the embedding view names no tier', () => {
    // The default a caller gets by saying nothing, which is what every view
    // that embeds this component exactly once wants.
    const fixture = render(fourDownloaded, [mindMap('NOT_DOWNLOADED')]);
    const button = wrapper(fixture).querySelector('button');

    expect(button?.classList.contains('bg-accent')).toBe(true);
  });

  it('drops to the outlined recipe at the secondary tier', () => {
    // What a view asks for once it already spends its accent somewhere else —
    // a learning path whose own download button sits above these.
    const fixture = render(fourDownloaded, [mindMap('NOT_DOWNLOADED')], 'secondary');
    const button = wrapper(fixture).querySelector('button');

    expect(button?.classList.contains('bg-accent')).toBe(false);
    expect(button?.className).toContain('border-border-strong');
    expect(button?.className).toContain('bg-surface-raised');
  });

  it('drops to the unfilled recipe at the ghost tier', () => {
    const fixture = render(fourDownloaded, [mindMap('NOT_DOWNLOADED')], 'ghost');
    const button = wrapper(fixture).querySelector('button');

    expect(button?.classList.contains('bg-accent')).toBe(false);
    expect(button?.className).not.toContain('border-border-strong');
    expect(button?.className).toContain('text-text-muted');
  });

  it('keeps the tier out of what the button does and says', async () => {
    // The tier is a matter of weight only: the same word, the same accessible
    // name, and the same enqueue behind it whichever recipe is drawn.
    const fixture = render(fourDownloaded, [mindMap('NOT_DOWNLOADED')], 'secondary');
    const button = wrapper(fixture).querySelector('button');

    expect(button?.textContent?.trim()).toBe('Download Signals');

    button?.click();
    await fixture.whenStable();

    expect(fake.enqueued).toEqual([{ kind: 'TRACK', id: 'track-1' }]);
  });

  it('enqueues the whole container when that button is pressed', async () => {
    const fixture = render(fourDownloaded, [mindMap('NOT_DOWNLOADED')]);
    wrapper(fixture).querySelector('button')?.click();
    await fixture.whenStable();

    expect(fake.enqueued).toEqual([{ kind: 'TRACK', id: 'track-1' }]);
  });

  it('keeps the container button focused while the enqueue is in flight, and refuses a second press', async () => {
    // An enqueue that never settles, so the in-flight state can be inspected.
    const enqueue = jest
      .spyOn(fake, 'enqueueDownload')
      .mockReturnValue(new Promise<never>(() => undefined));

    const fixture = render(fourDownloaded, [mindMap('NOT_DOWNLOADED')]);
    const button = wrapper(fixture).querySelector('button') as HTMLButtonElement;

    button.focus();
    button.click();
    fixture.detectChanges();

    expect(button.getAttribute('aria-disabled')).toBe('true');
    // Unavailable, not inert: the button that was pressed keeps the focus
    // instead of handing it to the document body.
    expect(document.activeElement).toBe(button);

    // The whole point of the handler's own guard — a control that is not
    // inert still fires its click handler, and a second enqueue here would
    // queue every lesson in the track twice.
    button.click();
    fixture.detectChanges();

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button);
  });

  it('reports the container complete once the mind map is stored too', () => {
    const fixture = render(fourDownloaded, [mindMap('DOWNLOADED')]);
    const element = wrapper(fixture);

    expect(element.textContent).toContain('5 of 5 downloaded');
    expect(element.querySelector('button')).toBeNull();
  });

  it('is unchanged for a container that has no extra units, such as a module', () => {
    const fixture = render(fourDownloaded);
    const element = wrapper(fixture);

    expect(element.textContent).toContain('4 of 4 downloaded');
    expect(element.querySelector('button')).toBeNull();
  });
});

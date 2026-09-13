import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { FakePlatformService } from '../../../testing/fake-platform.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { BundledTranslateLoader } from '../../core/i18n/translations';
import { PlatformService } from '../../core/platform/platform.service';
import { PuzzleCode, codeLines } from './puzzle-code';

/**
 * Hosts the listing the way a screen does, so the test drives inputs and
 * reads the output the same way the player screen and the editor do.
 */
@Component({
  selector: 'app-puzzle-code-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PuzzleCode],
  template: `
    <app-puzzle-code
      [code]="code()"
      [language]="'java'"
      [selectedLine]="selected()"
      [buggyLine]="buggy()"
      [locked]="locked()"
      (lineSelect)="picked.push($event)"
    />
  `,
})
class PuzzleCodeHost {
  readonly code = signal('int a = 1;\nint b = 2;\nreturn a / 0;');
  readonly selected = signal<number | null>(null);
  readonly buggy = signal<number | null>(null);
  readonly locked = signal(false);
  readonly picked: number[] = [];
}

describe('codeLines', () => {
  it('counts a listing the way the server does', () => {
    expect(codeLines('')).toEqual([]);
    expect(codeLines('one')).toEqual(['one']);
    expect(codeLines('one\ntwo')).toEqual(['one', 'two']);
    // A trailing newline terminates the last line rather than opening an
    // empty one -- this is the rule the answer line is validated against, so
    // an extra row here would shift every number below it.
    expect(codeLines('one\ntwo\n')).toEqual(['one', 'two']);
    // A blank line in the middle is a line and keeps its number.
    expect(codeLines('one\n\nthree')).toEqual(['one', '', 'three']);
  });

  it('folds CRLF and lone CR so a line number means one thing', () => {
    expect(codeLines('one\r\ntwo\r\n')).toEqual(['one', 'two']);
    expect(codeLines('one\rtwo')).toEqual(['one', 'two']);
  });
});

describe('PuzzleCode', () => {
  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PlatformService, useValue: new FakePlatformService() },
        provideTranslateService({ loader: BundledTranslateLoader, fallbackLang: 'en', lang: 'en' }),
      ],
    });
    await TestBed.inject(LocaleService).initialize('en');
  });

  async function render() {
    const fixture = TestBed.createComponent(PuzzleCodeHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function rows(fixture: { nativeElement: unknown }): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.puzzle-code-line'),
    );
  }

  it('renders one numbered, selectable row per line of the listing', async () => {
    const fixture = await render();

    const lines = rows(fixture);
    expect(lines).toHaveLength(3);
    expect(
      lines.map((row) => row.querySelector('.puzzle-code-number')?.textContent?.trim()),
    ).toEqual(['1', '2', '3']);
    // The source text reaches the row whether or not the highlighter could be
    // loaded: under this runner it cannot, and an unreadable listing would be
    // a worse failure than an uncoloured one.
    expect(lines[2].textContent).toContain('return a / 0;');
  });

  it('reports the one-based number of the line that was picked', async () => {
    const fixture = await render();
    const host = fixture.componentInstance;

    const third = rows(fixture)[2].querySelector('input') as HTMLInputElement;
    third.click();
    await fixture.whenStable();

    expect(host.picked).toEqual([3]);
  });

  it('marks the picked line while the answer is still unknown', async () => {
    const fixture = await render();

    fixture.componentInstance.selected.set(2);
    fixture.detectChanges();
    await fixture.whenStable();

    const lines = rows(fixture);
    expect(lines[1].classList).toContain('is-selected');
    expect(lines[1].classList).not.toContain('is-correct');
  });

  it('marks the answer and the miss separately once the answer is known', async () => {
    const fixture = await render();

    fixture.componentInstance.selected.set(1);
    fixture.componentInstance.buggy.set(3);
    fixture.componentInstance.locked.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const lines = rows(fixture);
    // Both lines are shown at once and said apart, rather than the highlight
    // quietly moving to the answer and leaving the reader to notice.
    expect(lines[0].classList).toContain('is-wrong');
    expect(lines[2].classList).toContain('is-correct');
    expect(lines[1].classList).not.toContain('is-selected');
  });

  it('marks a correct answer only as the answer, not also as a miss', async () => {
    const fixture = await render();

    fixture.componentInstance.selected.set(3);
    fixture.componentInstance.buggy.set(3);
    fixture.componentInstance.locked.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const lines = rows(fixture);
    expect(lines[2].classList).toContain('is-correct');
    expect(lines[2].classList).not.toContain('is-wrong');
  });

  it('refuses a pick once the attempt is spent', async () => {
    const fixture = await render();
    const host = fixture.componentInstance;

    host.locked.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const first = rows(fixture)[0].querySelector('input') as HTMLInputElement;
    expect(first.disabled).toBe(true);
    first.click();
    await fixture.whenStable();

    expect(host.picked).toEqual([]);
  });

  it('renumbers when the listing changes, which is what an author typing sees', async () => {
    const fixture = await render();

    fixture.componentInstance.code.set('one\ntwo\nthree\nfour');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const lines = rows(fixture);
    expect(lines).toHaveLength(4);
    expect(lines[3].textContent).toContain('four');
  });
});

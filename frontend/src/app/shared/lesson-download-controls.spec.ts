import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';

import { FakePlatformService } from '../../testing/fake-platform.service';
import { LocaleService } from '../core/i18n/locale.service';
import { BundledTranslateLoader } from '../core/i18n/translations';
import { PlatformService } from '../core/platform/platform.service';
import { LessonDownloadControls } from './lesson-download-controls';

describe('LessonDownloadControls', () => {
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

  function render() {
    const fixture = TestBed.createComponent(LessonDownloadControls);
    fixture.componentRef.setInput('lessonId', 'lesson-1');
    fixture.componentRef.setInput('title', 'Introduction');
    fixture.componentRef.setInput('baseAvailability', 'DOWNLOADED');
    fixture.detectChanges();
    return fixture;
  }

  function wrapper(fixture: ReturnType<typeof render>): HTMLElement {
    const element = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="lesson-download-controls"]',
    );
    if (element === null) {
      throw new Error('Controls wrapper not found.');
    }
    return element as HTMLElement;
  }

  it('renders the delete button for a downloaded lesson at rest', () => {
    const fixture = render();
    const buttons = wrapper(fixture).querySelectorAll('button');

    expect(buttons.length).toBe(1);
    // A row action, quiet rather than outlined: it carries no border of its
    // own, which is what separates it from the acquire button that takes its
    // place in the states where nothing is stored yet.
    expect(buttons[0].className).toContain('text-text-muted');
    expect(buttons[0].className).not.toContain('border-border');
  });

  it('renders only the status word for a downloaded lesson when acquireOnly is set', () => {
    const fixture = render();
    fixture.componentRef.setInput('acquireOnly', true);
    fixture.detectChanges();

    const host = wrapper(fixture);
    expect(host.querySelectorAll('button').length).toBe(0);
    expect(host.querySelector('[data-testid="availability-state"]')?.textContent?.trim()).not.toBe(
      '',
    );
  });

  it('keeps the download button focused while its transfer is being queued, and refuses a second press', async () => {
    // An enqueue that never settles, so the in-flight state can be inspected.
    const enqueue = jest
      .spyOn(fake, 'enqueueDownload')
      .mockReturnValue(new Promise<never>(() => undefined));

    const fixture = render();
    fixture.componentRef.setInput('baseAvailability', 'NOT_DOWNLOADED');
    fixture.detectChanges();

    const button = wrapper(fixture).querySelector('button') as HTMLButtonElement;
    button.focus();
    button.click();
    fixture.detectChanges();

    expect(button.getAttribute('aria-disabled')).toBe('true');
    // Unavailable, not inert: a row button that went `disabled` under the
    // finger that pressed it would drop the focus to the document body, and
    // the reader would have to tab back into a long lesson list from the top.
    expect(document.activeElement).toBe(button);

    button.click();
    fixture.detectChanges();

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button);
  });

  it('refuses to open the delete confirmation while an action is already in flight', async () => {
    jest.spyOn(fake, 'enqueueDownload').mockReturnValue(new Promise<never>(() => undefined));

    const fixture = render();
    fixture.componentRef.setInput('baseAvailability', 'UPDATE_AVAILABLE');
    fixture.detectChanges();

    const [update, remove] = Array.from(wrapper(fixture).querySelectorAll('button'));
    update.click();
    fixture.detectChanges();

    expect(remove.getAttribute('aria-disabled')).toBe('true');
    remove.focus();
    remove.click();
    fixture.detectChanges();

    // No confirmation opened: the pair of buttons is unchanged, and the one
    // that refused still holds the focus.
    expect(wrapper(fixture).querySelectorAll('button').length).toBe(2);
    expect(document.activeElement).toBe(remove);
  });

  it('replaces the delete button with a confirm/cancel pair once delete is requested', () => {
    const fixture = render();
    const before = wrapper(fixture).querySelectorAll('button');
    before[0].click();
    fixture.detectChanges();

    const after = Array.from(wrapper(fixture).querySelectorAll('button'));
    expect(after.length).toBe(2);

    // Found by what they say rather than by how they are drawn. Backing out of
    // the confirmation is an inline action like every other verb in this row
    // and carries no border, so a search for one would have found the wrong
    // button or none at all.
    const translate = TestBed.inject(TranslateService);
    const confirm = after.find((button) =>
      button.textContent?.includes(translate.instant('download.action.confirmDelete')),
    );
    const cancel = after.find((button) =>
      button.textContent?.includes(translate.instant('common.cancel')),
    );
    expect(confirm).not.toBeUndefined();
    expect(cancel).not.toBeUndefined();

    // Only the press that destroys something takes a fill; the way out of the
    // question is drawn as quietly as the button that opened it.
    expect(confirm!.className).toContain('bg-danger');
    expect(cancel!.className).not.toContain('bg-danger');
    expect(cancel!.className).not.toContain('border-border');
    expect(cancel!.className).toContain('text-text-muted');

    // The original at-rest delete button — with its `download.hint.delete`
    // aria-label — is gone: what remains is only the confirm/cancel pair.
    expect(after.every((button) => button.getAttribute('aria-label') === null)).toBe(true);
  });
});

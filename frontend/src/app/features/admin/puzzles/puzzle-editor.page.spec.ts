import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { FakeAdminPuzzleApiClient } from '../../../../testing/fake-puzzle-api.client';
import { FakeAuthSession } from '../../../../testing/fake-auth-session';
import { FakePlatformService } from '../../../../testing/fake-platform.service';
import { AuthSession } from '../../../core/auth/auth-session';
import { LocaleService } from '../../../core/i18n/locale.service';
import { BundledTranslateLoader } from '../../../core/i18n/translations';
import { PlatformService } from '../../../core/platform/platform.service';
import { AdminPuzzleApiClient } from '../../../core/puzzle/admin-puzzle-api.client';
import type { AdminPuzzle } from '../../../core/puzzle/puzzle-models';
import { PuzzleEditorPage } from './puzzle-editor.page';

const LISTING = 'int i = 0;\nwhile (i < 10) {\n  print(i);\n}';

function puzzle(overrides: Partial<AdminPuzzle> = {}): AdminPuzzle {
  return {
    id: 'puzzle-1',
    status: 'DRAFT',
    puzzleDate: '2026-09-14',
    title: 'Off by one',
    promptMarkdown: 'This loop never terminates.',
    language: 'java',
    code: LISTING,
    lineCount: 4,
    buggyLine: 2,
    explanationMarkdown: 'Nothing increments `i`.',
    createdBy: 'user-editor',
    publishedAt: null,
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-10T08:00:00.000Z',
    version: 3,
    ...overrides,
  };
}

describe('PuzzleEditorPage', () => {
  let api: FakeAdminPuzzleApiClient;
  let session: FakeAuthSession;

  beforeEach(async () => {
    api = new FakeAdminPuzzleApiClient();
    session = new FakeAuthSession();
    session.setRole('ADMIN');

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminPuzzleApiClient, useValue: api },
        { provide: AuthSession, useValue: session },
        { provide: PlatformService, useValue: new FakePlatformService() },
        provideTranslateService({ loader: BundledTranslateLoader, fallbackLang: 'en', lang: 'en' }),
      ],
    });
    await TestBed.inject(LocaleService).initialize('en');
  });

  async function settle(fixture: {
    detectChanges: () => void;
    whenStable: () => Promise<unknown>;
  }) {
    for (let round = 0; round < 3; round += 1) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  async function render(id?: string) {
    const fixture = TestBed.createComponent(PuzzleEditorPage);
    if (id !== undefined) {
      fixture.componentRef.setInput('id', id);
    }
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  }

  function element(fixture: { nativeElement: unknown }): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function type(fixture: { nativeElement: unknown }, selector: string, value: string): void {
    const field = element(fixture).querySelector(selector) as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  function save(fixture: { nativeElement: unknown }): void {
    (
      element(fixture).querySelector('[data-testid="puzzle-editor-save"]') as HTMLButtonElement
    ).click();
  }

  it('refuses to create a puzzle until every required field is answered', async () => {
    const fixture = await render();

    save(fixture);
    await settle(fixture);

    expect(api.createPuzzleCalls.calls).toHaveLength(0);
    const text = element(fixture).textContent ?? '';
    expect(text).toContain('A running day is required.');
    expect(text).toContain('A title is required.');
    expect(text).toContain('A listing is required.');
    expect(text).toContain('An explanation is required.');
  });

  it('refuses a language tag the server would reject anyway', async () => {
    const fixture = await render();

    type(fixture, '#puzzle-language', 'Java 21');
    save(fixture);
    await settle(fixture);

    expect(element(fixture).textContent).toContain('may only contain lowercase letters');
    expect(api.createPuzzleCalls.calls).toHaveLength(0);
  });

  it('refuses an answer line the listing does not have', async () => {
    const fixture = await render();

    type(fixture, '#puzzle-date', '2026-09-14');
    type(fixture, '#puzzle-title', 'Off by one');
    type(fixture, '#puzzle-language', 'java');
    type(fixture, '#puzzle-code', LISTING);
    type(fixture, '#puzzle-explanation', 'Nothing increments i.');
    type(fixture, '#puzzle-buggy-line', '9');
    save(fixture);
    await settle(fixture);

    expect(element(fixture).textContent).toContain('must be a line the listing actually has');
    expect(api.createPuzzleCalls.calls).toHaveLength(0);
  });

  it('creates a puzzle and goes to its own editing address', async () => {
    api.createPuzzleCalls.mockResolvedValue(puzzle());
    const router = TestBed.inject(Router);
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = await render();

    type(fixture, '#puzzle-date', '2026-09-14');
    type(fixture, '#puzzle-title', 'Off by one');
    type(fixture, '#puzzle-language', 'java');
    type(fixture, '#puzzle-code', LISTING);
    type(fixture, '#puzzle-explanation', 'Nothing increments i.');
    type(fixture, '#puzzle-buggy-line', '2');
    save(fixture);
    await settle(fixture);

    expect(api.createPuzzleCalls.lastArgs).toEqual([
      {
        puzzleDate: '2026-09-14',
        title: 'Off by one',
        promptMarkdown: undefined,
        language: 'java',
        code: LISTING,
        buggyLine: 2,
        explanationMarkdown: 'Nothing increments i.',
      },
    ]);
    expect(navigate).toHaveBeenCalledWith(['/admin/puzzles', 'puzzle-1', 'edit']);
  });

  it('sends only what changed, with the version it was read at', async () => {
    api.getPuzzleCalls.mockResolvedValue(puzzle());
    api.updatePuzzleCalls.mockResolvedValue(puzzle({ title: 'Never terminates', version: 4 }));
    const fixture = await render('puzzle-1');

    type(fixture, '#puzzle-title', 'Never terminates');
    save(fixture);
    await settle(fixture);

    expect(api.updatePuzzleCalls.lastArgs).toEqual([
      'puzzle-1',
      { version: 3, title: 'Never terminates' },
    ]);
    expect(
      element(fixture).querySelector('[data-testid="puzzle-editor-outcome"]')?.textContent?.trim(),
    ).toBe('Saved.');
  });

  it('sends an empty prompt rather than omitting it when one is cleared', async () => {
    api.getPuzzleCalls.mockResolvedValue(puzzle());
    api.updatePuzzleCalls.mockResolvedValue(puzzle({ promptMarkdown: null, version: 4 }));
    const fixture = await render('puzzle-1');

    type(fixture, '#puzzle-prompt', '');
    save(fixture);
    await settle(fixture);

    // Omitting it means "leave it alone", which would silently keep a prompt
    // the author just deleted.
    expect(api.updatePuzzleCalls.lastArgs).toEqual([
      'puzzle-1',
      { version: 3, promptMarkdown: '' },
    ]);
  });

  it('sets the answer line from a click in the preview', async () => {
    api.getPuzzleCalls.mockResolvedValue(puzzle());
    const fixture = await render('puzzle-1');

    const thirdLine =
      element(fixture).querySelectorAll<HTMLInputElement>('.puzzle-code-line input')[2];
    thirdLine.click();
    await settle(fixture);

    expect((element(fixture).querySelector('#puzzle-buggy-line') as HTMLInputElement).value).toBe(
      '3',
    );
  });

  it('freezes a published puzzle and says why', async () => {
    api.getPuzzleCalls.mockResolvedValue(puzzle({ status: 'PUBLISHED' }));
    const fixture = await render('puzzle-1');

    expect(element(fixture).textContent).toContain('A published puzzle is frozen');
    expect(element(fixture).querySelector('[data-testid="puzzle-editor-save"]')).toBeNull();
    expect((element(fixture).querySelector('#puzzle-title') as HTMLInputElement).disabled).toBe(
      true,
    );
  });

  it('asks for a reason before it will send a rejection', async () => {
    api.getPuzzleCalls.mockResolvedValue(puzzle({ status: 'PENDING_REVIEW' }));
    api.transitionPuzzleCalls.mockResolvedValue(puzzle({ status: 'REJECTED', version: 4 }));
    const fixture = await render('puzzle-1');

    (element(fixture).querySelector('[data-action="reject"]') as HTMLButtonElement).click();
    await settle(fixture);

    const confirm = element(fixture).querySelector(
      '[data-testid="puzzle-confirm-action"]',
    ) as HTMLButtonElement;
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    confirm.click();
    await settle(fixture);
    expect(api.transitionPuzzleCalls.calls).toHaveLength(0);

    const reason = element(fixture).querySelector('#puzzle-reason') as HTMLTextAreaElement;
    reason.value = 'The answer line is on a blank line.';
    reason.dispatchEvent(new Event('input'));
    await settle(fixture);
    (
      element(fixture).querySelector('[data-testid="puzzle-confirm-action"]') as HTMLButtonElement
    ).click();
    await settle(fixture);

    expect(api.transitionPuzzleCalls.lastArgs).toEqual([
      'puzzle-1',
      'reject',
      { expectedStatus: 'PENDING_REVIEW', reason: 'The answer line is on a blank line.' },
    ]);
  });

  it('shows an editor no decision to make on a puzzle awaiting review', async () => {
    session.setRole('EDITOR');
    api.getPuzzleCalls.mockResolvedValue(puzzle({ status: 'PENDING_REVIEW' }));
    const fixture = await render('puzzle-1');

    expect(element(fixture).querySelector('[data-action="approve"]')).toBeNull();
    expect(element(fixture).querySelector('[data-action="reject"]')).toBeNull();
    expect(element(fixture).querySelector('[data-action="delete"]')).not.toBeNull();
  });
});

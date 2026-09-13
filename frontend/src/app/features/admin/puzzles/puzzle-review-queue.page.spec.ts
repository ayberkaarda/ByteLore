import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { FakeAdminPuzzleApiClient } from '../../../../testing/fake-puzzle-api.client';
import { FakeAuthSession } from '../../../../testing/fake-auth-session';
import { FakePlatformService } from '../../../../testing/fake-platform.service';
import { AuthSession } from '../../../core/auth/auth-session';
import { LocaleService } from '../../../core/i18n/locale.service';
import { BundledTranslateLoader } from '../../../core/i18n/translations';
import { PlatformError } from '../../../core/platform/errors';
import { PlatformService } from '../../../core/platform/platform.service';
import { AdminPuzzleApiClient } from '../../../core/puzzle/admin-puzzle-api.client';
import type { AdminPuzzle, Page } from '../../../core/puzzle/puzzle-models';
import { PuzzleReviewQueuePage } from './puzzle-review-queue.page';

function puzzle(overrides: Partial<AdminPuzzle> = {}): AdminPuzzle {
  return {
    id: 'puzzle-1',
    status: 'PENDING_REVIEW',
    puzzleDate: '2026-09-14',
    title: 'Off by one',
    promptMarkdown: null,
    language: 'java',
    code: 'int i = 0;\nwhile (i < 10) {}',
    lineCount: 2,
    buggyLine: 2,
    explanationMarkdown: 'Nothing increments `i`.',
    createdBy: 'user-editor',
    publishedAt: null,
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-11T09:00:00.000Z',
    version: 2,
    ...overrides,
  };
}

function page(items: readonly AdminPuzzle[], overrides: Partial<Page<AdminPuzzle>> = {}) {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1, ...overrides };
}

describe('PuzzleReviewQueuePage', () => {
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

  async function render() {
    const fixture = TestBed.createComponent(PuzzleReviewQueuePage);
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  }

  function element(fixture: { nativeElement: unknown }): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('lists what is waiting, with the day it would run and where the answer sits', async () => {
    api.listReviewQueueCalls.mockResolvedValue(page([puzzle()]));
    const fixture = await render();

    expect(api.listReviewQueueCalls.lastArgs).toEqual([{ page: 0, size: 20 }]);
    const text = element(fixture).textContent ?? '';
    expect(text).toContain('Off by one');
    expect(text).toContain('Runs on 2026-09-14');
    expect(text).toContain('answer on line 2 of 2');
  });

  it('approves from the row and re-reads the queue the decision emptied', async () => {
    api.listReviewQueueCalls.mockResolvedValueOnce(page([puzzle()]));
    api.transitionPuzzleCalls.mockResolvedValue(puzzle({ status: 'PUBLISHED' }));
    api.listReviewQueueCalls.mockResolvedValue(page([]));
    const fixture = await render();

    (element(fixture).querySelector('[data-testid="queue-approve"]') as HTMLButtonElement).click();
    await settle(fixture);

    expect(api.transitionPuzzleCalls.lastArgs).toEqual([
      'puzzle-1',
      'approve',
      { expectedStatus: 'PENDING_REVIEW', reason: undefined },
    ]);
    // The row it removed may have been the last on its page, so the queue is
    // re-read rather than patched in place.
    expect(api.listReviewQueueCalls.calls).toHaveLength(2);
    expect(element(fixture).textContent).toContain('Nothing is waiting for a decision.');
  });

  it('will not send a rejection without a reason the author can act on', async () => {
    api.listReviewQueueCalls.mockResolvedValue(page([puzzle()]));
    const fixture = await render();

    (element(fixture).querySelector('[data-testid="queue-reject"]') as HTMLButtonElement).click();
    await settle(fixture);

    const confirm = element(fixture).querySelector(
      '[data-testid="queue-confirm-reject"]',
    ) as HTMLButtonElement;
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    confirm.click();
    await settle(fixture);
    expect(api.transitionPuzzleCalls.calls).toHaveLength(0);

    const reason = element(fixture).querySelector('textarea') as HTMLTextAreaElement;
    reason.value = 'The listing does not compile.';
    reason.dispatchEvent(new Event('input'));
    await settle(fixture);

    api.transitionPuzzleCalls.mockResolvedValue(puzzle({ status: 'REJECTED' }));
    api.listReviewQueueCalls.mockResolvedValue(page([]));
    (
      element(fixture).querySelector('[data-testid="queue-confirm-reject"]') as HTMLButtonElement
    ).click();
    await settle(fixture);

    expect(api.transitionPuzzleCalls.lastArgs).toEqual([
      'puzzle-1',
      'reject',
      { expectedStatus: 'PENDING_REVIEW', reason: 'The listing does not compile.' },
    ]);
  });

  it('shows an editor the queue and the link, and no decision at all', async () => {
    session.setRole('EDITOR');
    api.listReviewQueueCalls.mockResolvedValue(page([puzzle()]));
    const fixture = await render();

    expect(element(fixture).querySelector('[data-testid="queue-approve"]')).toBeNull();
    expect(element(fixture).querySelector('[data-testid="queue-reject"]')).toBeNull();
    expect(element(fixture).querySelector('a[href="/admin/puzzles/puzzle-1/edit"]')).not.toBeNull();
  });

  it('keeps a failed decision on its own row rather than replacing the queue', async () => {
    api.listReviewQueueCalls.mockResolvedValue(page([puzzle()]));
    api.transitionPuzzleCalls.mockRejectedValue(
      new PlatformError('VERSION_CONFLICT', 'changed underneath'),
    );
    const fixture = await render();

    (element(fixture).querySelector('[data-testid="queue-approve"]') as HTMLButtonElement).click();
    await settle(fixture);

    expect(element(fixture).querySelector('[role="alert"]')).not.toBeNull();
    // The list is still a list: one row's failure is not the queue's failure.
    expect(element(fixture).textContent).toContain('Off by one');
  });
});

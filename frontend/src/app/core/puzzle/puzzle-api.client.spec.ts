import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../platform/api';
import { PlatformError } from '../platform/errors';
import { AdminPuzzleApiClient } from './admin-puzzle-api.client';
import { PuzzleApiClient } from './puzzle-api.client';

const BASE = 'https://api.example.test/api/v1';

function wireAdminPuzzle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'puzzle-1',
    status: 'DRAFT',
    puzzle_date: '2026-09-14',
    title: 'Off by one',
    prompt_markdown: 'This loop never terminates.',
    language: 'java',
    code: 'int i = 0;\nwhile (i < 10) {}',
    line_count: 2,
    buggy_line: 2,
    explanation_markdown: 'Nothing increments `i`.',
    created_by: 'user-1',
    published_at: null,
    created_at: '2026-09-10T08:00:00.000Z',
    updated_at: '2026-09-11T09:00:00.000Z',
    version: 3,
    ...overrides,
  };
}

describe('PuzzleApiClient', () => {
  let client: PuzzleApiClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: BASE },
        PuzzleApiClient,
      ],
    });
    client = TestBed.inject(PuzzleApiClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('maps an unanswered puzzle without inventing an answer for it', async () => {
    const promise = client.getToday();

    const request = http.expectOne(`${BASE}/puzzle/today`);
    expect(request.request.method).toBe('GET');
    request.flush({
      id: 'puzzle-1',
      puzzle_date: '2026-09-13',
      title: 'Off by one',
      prompt_markdown: null,
      language: 'java',
      code: 'int i = 0;',
      line_count: 1,
      attempted: false,
      buggy_line: null,
      explanation_markdown: null,
      attempt: null,
    });

    await expect(promise).resolves.toEqual({
      id: 'puzzle-1',
      puzzleDate: '2026-09-13',
      title: 'Off by one',
      promptMarkdown: null,
      language: 'java',
      code: 'int i = 0;',
      lineCount: 1,
      attempted: false,
      buggyLine: null,
      explanationMarkdown: null,
      attempt: null,
    });
  });

  it('maps the answered form, the caller’s own attempt included', async () => {
    const promise = client.getToday();

    http.expectOne(`${BASE}/puzzle/today`).flush({
      id: 'puzzle-1',
      puzzle_date: '2026-09-13',
      title: 'Off by one',
      prompt_markdown: null,
      language: 'java',
      code: 'int i = 0;',
      line_count: 1,
      attempted: true,
      buggy_line: 1,
      explanation_markdown: 'Explained.',
      attempt: {
        selected_line: 1,
        correct: true,
        elapsed_millis: 18_400,
        submitted_at: '2026-09-13T08:00:00.000Z',
      },
    });

    const puzzle = await promise;
    expect(puzzle.buggyLine).toBe(1);
    expect(puzzle.attempt).toEqual({
      selectedLine: 1,
      correct: true,
      elapsedMillis: 18_400,
      submittedAt: '2026-09-13T08:00:00.000Z',
    });
  });

  it('sends an attempt in the wire’s own naming and maps the verdict back', async () => {
    const promise = client.submitAttempt({ selectedLine: 3, elapsedMillis: 42_000 });

    const request = http.expectOne(`${BASE}/puzzle/today/attempt`);
    expect(request.request.method).toBe('POST');
    // The puzzle is not named in the body: the server resolves today's, so no
    // shape of this request can reach yesterday's answer key.
    expect(request.request.body).toEqual({ selected_line: 3, elapsed_millis: 42_000 });
    request.flush({
      puzzle_id: 'puzzle-1',
      selected_line: 3,
      correct: false,
      buggy_line: 2,
      explanation_markdown: 'Explained.',
      elapsed_millis: 42_000,
      submitted_at: '2026-09-13T09:12:00.000Z',
      current_streak: 0,
      longest_streak: 7,
    });

    await expect(promise).resolves.toEqual({
      puzzleId: 'puzzle-1',
      selectedLine: 3,
      correct: false,
      buggyLine: 2,
      explanationMarkdown: 'Explained.',
      elapsedMillis: 42_000,
      submittedAt: '2026-09-13T09:12:00.000Z',
      currentStreak: 0,
      longestStreak: 7,
    });
  });

  it('turns an already-spent attempt into the code the interface has words for', async () => {
    const promise = client.submitAttempt({ selectedLine: 1, elapsedMillis: 10 });

    http
      .expectOne(`${BASE}/puzzle/today/attempt`)
      .flush(
        { code: 'PUZZLE_ALREADY_ATTEMPTED', message: 'already answered' },
        { status: 409, statusText: 'Conflict' },
      );

    await expect(promise).rejects.toBeInstanceOf(PlatformError);
  });

  it('asks for one board order at a time and maps the page envelope', async () => {
    const promise = client.getLeaderboard({ sort: 'streak', page: 0, size: 10 });

    const request = http.expectOne(
      (candidate) => candidate.url === `${BASE}/puzzle/today/leaderboard`,
    );
    expect(request.request.params.get('sort')).toBe('streak');
    expect(request.request.params.get('size')).toBe('10');
    request.flush({
      items: [
        {
          user_id: 'user-1',
          display_name: 'Mira',
          elapsed_millis: 31_500,
          submitted_at: '2026-09-13T07:41:00.000Z',
          current_streak: 4,
        },
      ],
      page: 0,
      size: 10,
      total_elements: 1,
      total_pages: 1,
    });

    const board = await promise;
    expect(board.totalElements).toBe(1);
    expect(board.items[0]).toEqual({
      userId: 'user-1',
      displayName: 'Mira',
      elapsedMillis: 31_500,
      submittedAt: '2026-09-13T07:41:00.000Z',
      currentStreak: 4,
    });
  });
});

describe('AdminPuzzleApiClient', () => {
  let client: AdminPuzzleApiClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: BASE },
        AdminPuzzleApiClient,
      ],
    });
    client = TestBed.inject(AdminPuzzleApiClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends every list filter and maps the page envelope to camelCase', async () => {
    const promise = client.listPuzzles({
      status: 'PENDING_REVIEW',
      q: 'loop',
      page: 1,
      size: 20,
      sort: ['puzzle_date,desc'],
    });

    const request = http.expectOne((candidate) => candidate.url === `${BASE}/admin/puzzles`);
    expect(request.request.params.get('status')).toBe('PENDING_REVIEW');
    expect(request.request.params.get('q')).toBe('loop');
    expect(request.request.params.getAll('sort')).toEqual(['puzzle_date,desc']);
    request.flush({
      items: [wireAdminPuzzle()],
      page: 1,
      size: 20,
      total_elements: 21,
      total_pages: 2,
    });

    const page = await promise;
    expect(page.totalPages).toBe(2);
    expect(page.items[0]).toEqual({
      id: 'puzzle-1',
      status: 'DRAFT',
      puzzleDate: '2026-09-14',
      title: 'Off by one',
      promptMarkdown: 'This loop never terminates.',
      language: 'java',
      code: 'int i = 0;\nwhile (i < 10) {}',
      lineCount: 2,
      buggyLine: 2,
      explanationMarkdown: 'Nothing increments `i`.',
      createdBy: 'user-1',
      publishedAt: null,
      createdAt: '2026-09-10T08:00:00.000Z',
      updatedAt: '2026-09-11T09:00:00.000Z',
      version: 3,
    });
  });

  it('reads the review queue from its own path, not from a filter on the list', async () => {
    const promise = client.listReviewQueue({ page: 0, size: 20 });

    const request = http.expectOne(
      (candidate) => candidate.url === `${BASE}/admin/puzzles/review-queue`,
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      items: [wireAdminPuzzle({ status: 'PENDING_REVIEW' })],
      page: 0,
      size: 20,
      total_elements: 1,
      total_pages: 1,
    });

    await expect(promise).resolves.toMatchObject({ items: [{ status: 'PENDING_REVIEW' }] });
  });

  it('writes a new puzzle in the wire’s naming and never sends a status', async () => {
    const promise = client.createPuzzle({
      puzzleDate: '2026-09-14',
      title: 'Off by one',
      promptMarkdown: 'Context.',
      language: 'java',
      code: 'int i = 0;',
      buggyLine: 1,
      explanationMarkdown: 'Explained.',
    });

    const request = http.expectOne(`${BASE}/admin/puzzles`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      puzzle_date: '2026-09-14',
      title: 'Off by one',
      prompt_markdown: 'Context.',
      language: 'java',
      code: 'int i = 0;',
      buggy_line: 1,
      explanation_markdown: 'Explained.',
    });
    request.flush(wireAdminPuzzle(), { status: 201, statusText: 'Created' });

    await expect(promise).resolves.toMatchObject({ id: 'puzzle-1' });
  });

  it('patches only what it was given, version included', async () => {
    const promise = client.updatePuzzle('puzzle-1', { version: 3, title: 'Never terminates' });

    const request = http.expectOne(`${BASE}/admin/puzzles/puzzle-1`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      version: 3,
      puzzle_date: undefined,
      title: 'Never terminates',
      prompt_markdown: undefined,
      language: undefined,
      code: undefined,
      buggy_line: undefined,
      explanation_markdown: undefined,
    });
    request.flush(wireAdminPuzzle({ title: 'Never terminates', version: 4 }));

    await expect(promise).resolves.toMatchObject({ version: 4 });
  });

  it('puts the transition in the path and the expected status in the body', async () => {
    const promise = client.transitionPuzzle('puzzle-1', 'reject', {
      expectedStatus: 'PENDING_REVIEW',
      reason: 'The listing does not compile.',
    });

    const request = http.expectOne(`${BASE}/admin/puzzles/puzzle-1/reject`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      expected_status: 'PENDING_REVIEW',
      reason: 'The listing does not compile.',
    });
    request.flush(wireAdminPuzzle({ status: 'REJECTED' }));

    await expect(promise).resolves.toMatchObject({ status: 'REJECTED' });
  });

  it('maps the audit trail, whose every step has an actor behind it', async () => {
    const promise = client.listAuditLog('puzzle-1', { page: 0, size: 20 });

    const request = http.expectOne(
      (candidate) => candidate.url === `${BASE}/admin/puzzles/puzzle-1/audit-log`,
    );
    request.flush({
      items: [
        {
          id: 'log-1',
          step: 'SUBMIT',
          actor_user_id: 'user-1',
          from_status: 'DRAFT',
          to_status: 'PENDING_REVIEW',
          reason: null,
          occurred_at: '2026-09-11T09:00:00.000Z',
        },
      ],
      page: 0,
      size: 20,
      total_elements: 1,
      total_pages: 1,
    });

    const page = await promise;
    expect(page.items[0]).toEqual({
      id: 'log-1',
      step: 'SUBMIT',
      actorUserId: 'user-1',
      fromStatus: 'DRAFT',
      toStatus: 'PENDING_REVIEW',
      reason: null,
      occurredAt: '2026-09-11T09:00:00.000Z',
    });
  });
});

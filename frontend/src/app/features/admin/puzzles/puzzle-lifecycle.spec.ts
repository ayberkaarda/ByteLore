import type { AdminPuzzle } from '../../../core/puzzle/puzzle-models';
import { availablePuzzleActions, canEditPuzzle, puzzleReasonRequired } from './puzzle-lifecycle';

function puzzle(overrides: Partial<AdminPuzzle> = {}): AdminPuzzle {
  return {
    id: 'puzzle-1',
    status: 'DRAFT',
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
    updatedAt: '2026-09-10T08:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

describe('availablePuzzleActions', () => {
  it('offers an editor a draft to submit and to delete, and nothing else', () => {
    expect(availablePuzzleActions(puzzle(), 'EDITOR')).toEqual(['submit', 'delete']);
  });

  it('lets a rejected puzzle be submitted again after it is fixed', () => {
    expect(availablePuzzleActions(puzzle({ status: 'REJECTED' }), 'EDITOR')).toEqual([
      'submit',
      'delete',
    ]);
  });

  it('withholds the decision from an editor while the puzzle awaits review', () => {
    // An editor writes and recommends; somebody else decides whether the
    // whole platform sees it. Showing a control for a decision the server
    // will refuse teaches people the application is broken.
    expect(availablePuzzleActions(puzzle({ status: 'PENDING_REVIEW' }), 'EDITOR')).toEqual([
      'delete',
    ]);
  });

  it('gives an administrator both decisions on a puzzle awaiting review', () => {
    expect(availablePuzzleActions(puzzle({ status: 'PENDING_REVIEW' }), 'ADMIN')).toEqual([
      'approve',
      'reject',
      'delete',
    ]);
  });

  it('leaves a published puzzle with nothing at all, deletion included', () => {
    // People have already played it, and their recorded attempts describe a
    // listing that would be gone.
    expect(availablePuzzleActions(puzzle({ status: 'PUBLISHED' }), 'ADMIN')).toEqual([]);
  });

  it('never offers a draft straight to approval: review is unavoidable', () => {
    expect(availablePuzzleActions(puzzle({ status: 'DRAFT' }), 'ADMIN')).toEqual([
      'submit',
      'delete',
    ]);
  });
});

describe('canEditPuzzle', () => {
  it('freezes a published puzzle and leaves every other state editable', () => {
    expect(canEditPuzzle(puzzle({ status: 'DRAFT' }))).toBe(true);
    expect(canEditPuzzle(puzzle({ status: 'PENDING_REVIEW' }))).toBe(true);
    expect(canEditPuzzle(puzzle({ status: 'REJECTED' }))).toBe(true);
    expect(canEditPuzzle(puzzle({ status: 'PUBLISHED' }))).toBe(false);
  });
});

describe('puzzleReasonRequired', () => {
  it('asks for a reason only where the author has something to act on', () => {
    expect(puzzleReasonRequired('reject')).toBe(true);
    expect(puzzleReasonRequired('approve')).toBe(false);
    expect(puzzleReasonRequired('submit')).toBe(false);
    expect(puzzleReasonRequired('delete')).toBe(false);
  });
});

import type { Role } from '../../../core/auth/auth-models';
import type { AdminPuzzle, PuzzleStatus } from '../../../core/puzzle/puzzle-models';

/**
 * The actions a user can see on one puzzle.
 *
 * Named apart from `PuzzleTransitionAction` (`core/puzzle/puzzle-models.ts`)
 * on purpose: that type is the three HTTP transitions the server exposes as
 * `POST .../{action}` endpoints. This type adds `'delete'`, because deleting
 * a puzzle is a decision a person makes about it exactly like the other
 * three, even though on the wire it is a different verb on a different path.
 * Two names means a caller importing the wrong one gets a compile error
 * rather than quietly sending `'delete'` to an endpoint that has never heard
 * of it.
 */
export type PuzzleLifecycleAction = 'submit' | 'approve' | 'reject' | 'delete';

/**
 * `approve` and `reject` are the two routes listed ahead of the general
 * `/api/v1/admin/**` rule for this prefix in the server's request matcher, so
 * they are the two an `EDITOR` cannot take. An editor writes a puzzle and
 * recommends it; somebody else decides whether the whole platform sees it.
 */
const ADMIN_ONLY_ACTIONS: ReadonlySet<PuzzleLifecycleAction> = new Set(['approve', 'reject']);

/**
 * The statuses each transition is legal from, mirroring the
 * `requireTransition` call at the top of each service method.
 *
 * There is no path from `DRAFT` straight to `PUBLISHED`: review is
 * unavoidable for a puzzle, because it runs for everybody on one day and
 * there is no per-reader blast radius to fall back on. `delete` has no entry
 * here — its rule is "not `PUBLISHED`", the inverse shape of every other
 * action's "must be one of these", so it is checked separately.
 */
const FROM_STATUSES: Readonly<
  Record<Exclude<PuzzleLifecycleAction, 'delete'>, ReadonlySet<PuzzleStatus>>
> = {
  submit: new Set<PuzzleStatus>(['DRAFT', 'REJECTED']),
  approve: new Set<PuzzleStatus>(['PENDING_REVIEW']),
  reject: new Set<PuzzleStatus>(['PENDING_REVIEW']),
};

const TRANSITIONS_IN_ORDER: readonly Exclude<PuzzleLifecycleAction, 'delete'>[] = [
  'submit',
  'approve',
  'reject',
];

/**
 * Which actions a user with `role` can see on `puzzle` right now.
 *
 * A visibility rule, not merely a "would the server accept this" check: an
 * `EDITOR` looking at a puzzle awaiting review never sees `approve` or
 * `reject` at all, rather than seeing them greyed out — a role should not be
 * shown a control for a decision it cannot make.
 */
export function availablePuzzleActions(
  puzzle: AdminPuzzle,
  role: Role,
): readonly PuzzleLifecycleAction[] {
  const actions: PuzzleLifecycleAction[] = [];

  for (const action of TRANSITIONS_IN_ORDER) {
    if (ADMIN_ONLY_ACTIONS.has(action) && role !== 'ADMIN') {
      continue;
    }
    if (!FROM_STATUSES[action].has(puzzle.status)) {
      continue;
    }
    actions.push(action);
  }

  if (puzzle.status !== 'PUBLISHED') {
    // A published puzzle cannot be deleted: people have already played it,
    // and their recorded attempts describe a listing that would be gone.
    actions.push('delete');
  }

  return actions;
}

/**
 * Whether a puzzle still accepts edits.
 *
 * A published puzzle is frozen outright. Players are answering that listing
 * right now and some have already spent their one attempt on it, so moving
 * the answer line under them would invalidate attempts that are recorded and
 * cannot be replayed. The way to correct a published puzzle is to publish a
 * different one.
 */
export function canEditPuzzle(puzzle: AdminPuzzle): boolean {
  return puzzle.status !== 'PUBLISHED';
}

/**
 * Whether `action` needs a reason before the server will accept it. Only
 * `reject` does, and it wants at least ten characters of one: a rejection
 * with no stated cause is a decision the author cannot act on.
 */
export function puzzleReasonRequired(action: PuzzleLifecycleAction): boolean {
  return action === 'reject';
}

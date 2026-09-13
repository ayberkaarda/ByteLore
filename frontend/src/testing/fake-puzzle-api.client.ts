import type {
  AdminPuzzle,
  AdminPuzzleListQuery,
  CreatePuzzleInput,
  DailyPuzzle,
  LeaderboardEntry,
  LeaderboardQuery,
  Page,
  PuzzleAttemptInput,
  PuzzleAttemptResult,
  PuzzleAuditLogItem,
  PuzzlePageQuery,
  PuzzleQueueQuery,
  PuzzleTransitionAction,
  PuzzleTransitionInput,
  UpdatePuzzleInput,
} from '../app/core/puzzle/puzzle-models';
import { FakeMethod } from './fake-method';

/**
 * Stands in for `PuzzleApiClient` on the player screen.
 *
 * Injected with `{ provide: PuzzleApiClient, useValue: new
 * FakePuzzleApiClient() }`. Each method has a matching `FakeMethod` named
 * with the same `...Calls` suffix, so a test arms the answer, the component
 * calls the method, and the test asserts on `.calls` / `.lastArgs`
 * afterwards — rather than standing up `HttpTestingController` for a screen
 * that has nothing to say about transport.
 */
export class FakePuzzleApiClient {
  readonly getTodayCalls = new FakeMethod<[], DailyPuzzle>();
  readonly submitAttemptCalls = new FakeMethod<[PuzzleAttemptInput], PuzzleAttemptResult>();
  readonly getLeaderboardCalls = new FakeMethod<[LeaderboardQuery], Page<LeaderboardEntry>>();

  getToday = (): Promise<DailyPuzzle> => this.getTodayCalls.resolveCall();
  submitAttempt = (input: PuzzleAttemptInput): Promise<PuzzleAttemptResult> =>
    this.submitAttemptCalls.resolveCall(input);
  getLeaderboard = (query: LeaderboardQuery): Promise<Page<LeaderboardEntry>> =>
    this.getLeaderboardCalls.resolveCall(query);
}

/** Stands in for `AdminPuzzleApiClient` on the authoring and review screens. */
export class FakeAdminPuzzleApiClient {
  readonly listPuzzlesCalls = new FakeMethod<[AdminPuzzleListQuery], Page<AdminPuzzle>>();
  readonly listReviewQueueCalls = new FakeMethod<[PuzzleQueueQuery], Page<AdminPuzzle>>();
  readonly getPuzzleCalls = new FakeMethod<[string], AdminPuzzle>();
  readonly createPuzzleCalls = new FakeMethod<[CreatePuzzleInput], AdminPuzzle>();
  readonly updatePuzzleCalls = new FakeMethod<[string, UpdatePuzzleInput], AdminPuzzle>();
  readonly deletePuzzleCalls = new FakeMethod<[string], void>();
  readonly transitionPuzzleCalls = new FakeMethod<
    [string, PuzzleTransitionAction, PuzzleTransitionInput],
    AdminPuzzle
  >();
  readonly listAuditLogCalls = new FakeMethod<
    [string, PuzzlePageQuery],
    Page<PuzzleAuditLogItem>
  >();

  listPuzzles = (query: AdminPuzzleListQuery): Promise<Page<AdminPuzzle>> =>
    this.listPuzzlesCalls.resolveCall(query);
  listReviewQueue = (query: PuzzleQueueQuery): Promise<Page<AdminPuzzle>> =>
    this.listReviewQueueCalls.resolveCall(query);
  getPuzzle = (id: string): Promise<AdminPuzzle> => this.getPuzzleCalls.resolveCall(id);
  createPuzzle = (input: CreatePuzzleInput): Promise<AdminPuzzle> =>
    this.createPuzzleCalls.resolveCall(input);
  updatePuzzle = (id: string, input: UpdatePuzzleInput): Promise<AdminPuzzle> =>
    this.updatePuzzleCalls.resolveCall(id, input);
  deletePuzzle = (id: string): Promise<void> => this.deletePuzzleCalls.resolveCall(id);
  transitionPuzzle = (
    id: string,
    action: PuzzleTransitionAction,
    input: PuzzleTransitionInput,
  ): Promise<AdminPuzzle> => this.transitionPuzzleCalls.resolveCall(id, action, input);
  listAuditLog = (id: string, query: PuzzlePageQuery): Promise<Page<PuzzleAuditLogItem>> =>
    this.listAuditLogCalls.resolveCall(id, query);
}

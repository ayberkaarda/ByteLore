import type {
  AdminBlogListQuery,
  AdminBlogPost,
  AdminBlogPostSummary,
  AuditLogItem,
  CreateBlogPostInput,
  CreateSourceInput,
  Page,
  PageQueryInput,
  ReviewDetail,
  ReviewQueueQuery,
  SourceFetchResult,
  SourceListQuery,
  SourceUpdateDetail,
  TransitionAction,
  TransitionInput,
  UpdateBlogPostInput,
  UpdateSourceInput,
  WhitelistSource,
} from '../app/core/admin/admin-models';
import { FakeMethod } from './fake-method';

/**
 * A hand-built test double standing in for `AdminApiClient` in component
 * tests.
 *
 * A screen test injects one of these with `{ provide: AdminApiClient,
 * useValue: new FakeAdminApiClient() }`. Each `AdminApiClient` method has a
 * matching `FakeMethod` here, named with the same `...Calls` suffix
 * throughout: `fake.getBlogPostCalls.mockResolvedValueOnce(post)` programs
 * the answer, `fake.getBlogPost(id)` is what the component under test
 * actually calls, and `fake.getBlogPostCalls.calls` / `.lastArgs` is what the
 * test asserts on afterwards -- rather than standing up
 * `HttpTestingController` for a component that has nothing to say about
 * transport, which is what `admin-api.client.spec.ts` already covers on its
 * own.
 */
export class FakeAdminApiClient {
  // ---- Blog -------------------------------------------------------------------
  readonly listBlogPostsCalls = new FakeMethod<[AdminBlogListQuery], Page<AdminBlogPostSummary>>();
  readonly getBlogPostCalls = new FakeMethod<[string], AdminBlogPost>();
  readonly createBlogPostCalls = new FakeMethod<[CreateBlogPostInput], AdminBlogPost>();
  readonly updateBlogPostCalls = new FakeMethod<[string, UpdateBlogPostInput], AdminBlogPost>();
  readonly deleteBlogPostCalls = new FakeMethod<[string], void>();
  readonly transitionBlogPostCalls = new FakeMethod<
    [string, TransitionAction, TransitionInput],
    AdminBlogPost
  >();
  readonly listAuditLogCalls = new FakeMethod<[string, PageQueryInput], Page<AuditLogItem>>();

  // ---- Review -----------------------------------------------------------------
  readonly listReviewQueueCalls = new FakeMethod<[ReviewQueueQuery], Page<AdminBlogPostSummary>>();
  readonly getReviewDetailCalls = new FakeMethod<[string], ReviewDetail>();
  readonly getSourceUpdateCalls = new FakeMethod<[string], SourceUpdateDetail>();

  // ---- Whitelist sources --------------------------------------------------------
  readonly listSourcesCalls = new FakeMethod<[SourceListQuery], Page<WhitelistSource>>();
  readonly getSourceCalls = new FakeMethod<[string], WhitelistSource>();
  readonly createSourceCalls = new FakeMethod<[CreateSourceInput], WhitelistSource>();
  readonly updateSourceCalls = new FakeMethod<[string, UpdateSourceInput], WhitelistSource>();
  readonly deleteSourceCalls = new FakeMethod<[string], void>();
  readonly fetchSourceNowCalls = new FakeMethod<[string], SourceFetchResult>();

  // ---- The AdminApiClient surface a component actually calls ------------------

  listBlogPosts = (query: AdminBlogListQuery): Promise<Page<AdminBlogPostSummary>> =>
    this.listBlogPostsCalls.resolveCall(query);
  getBlogPost = (id: string): Promise<AdminBlogPost> => this.getBlogPostCalls.resolveCall(id);
  createBlogPost = (input: CreateBlogPostInput): Promise<AdminBlogPost> =>
    this.createBlogPostCalls.resolveCall(input);
  updateBlogPost = (id: string, input: UpdateBlogPostInput): Promise<AdminBlogPost> =>
    this.updateBlogPostCalls.resolveCall(id, input);
  deleteBlogPost = (id: string): Promise<void> => this.deleteBlogPostCalls.resolveCall(id);
  transitionBlogPost = (
    id: string,
    action: TransitionAction,
    input: TransitionInput,
  ): Promise<AdminBlogPost> => this.transitionBlogPostCalls.resolveCall(id, action, input);
  listAuditLog = (id: string, query: PageQueryInput): Promise<Page<AuditLogItem>> =>
    this.listAuditLogCalls.resolveCall(id, query);

  listReviewQueue = (query: ReviewQueueQuery): Promise<Page<AdminBlogPostSummary>> =>
    this.listReviewQueueCalls.resolveCall(query);
  getReviewDetail = (postId: string): Promise<ReviewDetail> =>
    this.getReviewDetailCalls.resolveCall(postId);
  getSourceUpdate = (id: string): Promise<SourceUpdateDetail> =>
    this.getSourceUpdateCalls.resolveCall(id);

  listSources = (query: SourceListQuery): Promise<Page<WhitelistSource>> =>
    this.listSourcesCalls.resolveCall(query);
  getSource = (id: string): Promise<WhitelistSource> => this.getSourceCalls.resolveCall(id);
  createSource = (input: CreateSourceInput): Promise<WhitelistSource> =>
    this.createSourceCalls.resolveCall(input);
  updateSource = (id: string, input: UpdateSourceInput): Promise<WhitelistSource> =>
    this.updateSourceCalls.resolveCall(id, input);
  deleteSource = (id: string): Promise<void> => this.deleteSourceCalls.resolveCall(id);
  fetchSourceNow = (id: string): Promise<SourceFetchResult> =>
    this.fetchSourceNowCalls.resolveCall(id);
}

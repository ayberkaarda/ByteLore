import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL, toPlatformError } from '../platform/api';
import type { Page } from '../platform/models';
import type { WirePage } from '../platform/rest-wire';
import type {
  AdminPuzzle,
  AdminPuzzleListQuery,
  CreatePuzzleInput,
  PuzzleAuditLogItem,
  PuzzlePageQuery,
  PuzzleQueueQuery,
  PuzzleTransitionAction,
  PuzzleTransitionInput,
  UpdatePuzzleInput,
} from './puzzle-models';
import type {
  WireAdminPuzzle,
  WireCreatePuzzleRequest,
  WirePuzzleAuditLogItem,
  WirePuzzleTransitionRequest,
  WireUpdatePuzzleRequest,
} from './puzzle-wire';

/**
 * Authoring and review of the daily bug hunt.
 *
 * Kept apart from `AdminApiClient` rather than added to it: the two surfaces
 * share a shape of thinking but no endpoint, no payload and no sort
 * vocabulary, and the puzzle review queue is a different path from the blog's
 * precisely because a reviewer needs the answer line here, which no blog post
 * has. Following the same conventions — `HttpClient` + `HttpParams`,
 * `firstValueFrom`, wire types apart from view models, mapping done here
 * rather than left to each caller.
 *
 * `EDITOR` and `ADMIN` reach everything here; `approve` and `reject` are
 * `ADMIN` only, enforced server-side. An editor writes a puzzle and
 * recommends it, and somebody else decides whether the whole platform sees
 * it.
 */
@Injectable({ providedIn: 'root' })
export class AdminPuzzleApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  async listPuzzles(query: AdminPuzzleListQuery): Promise<Page<AdminPuzzle>> {
    const params = buildParams({
      status: query.status,
      q: query.q,
      page: query.page,
      size: query.size,
      sort: query.sort,
    });
    try {
      const page = await firstValueFrom(
        this.http.get<WirePage<WireAdminPuzzle>>(`${this.baseUrl}/admin/puzzles`, { params }),
      );
      return toPage(page, toAdminPuzzle);
    } catch (error) {
      throw toPlatformError(error);
    }
  }

  /** The puzzles waiting for a decision, the soonest running day first. */
  async listReviewQueue(query: PuzzleQueueQuery): Promise<Page<AdminPuzzle>> {
    const params = buildParams({ page: query.page, size: query.size, sort: query.sort });
    try {
      const page = await firstValueFrom(
        this.http.get<WirePage<WireAdminPuzzle>>(`${this.baseUrl}/admin/puzzles/review-queue`, {
          params,
        }),
      );
      return toPage(page, toAdminPuzzle);
    } catch (error) {
      throw toPlatformError(error);
    }
  }

  async getPuzzle(id: string): Promise<AdminPuzzle> {
    try {
      const wire = await firstValueFrom(
        this.http.get<WireAdminPuzzle>(`${this.baseUrl}/admin/puzzles/${encodeURIComponent(id)}`),
      );
      return toAdminPuzzle(wire);
    } catch (error) {
      throw toPlatformError(error);
    }
  }

  async createPuzzle(input: CreatePuzzleInput): Promise<AdminPuzzle> {
    const body: WireCreatePuzzleRequest = {
      puzzle_date: input.puzzleDate,
      title: input.title,
      prompt_markdown: input.promptMarkdown,
      language: input.language,
      code: input.code,
      buggy_line: input.buggyLine,
      explanation_markdown: input.explanationMarkdown,
    };
    try {
      const wire = await firstValueFrom(
        this.http.post<WireAdminPuzzle>(`${this.baseUrl}/admin/puzzles`, body),
      );
      return toAdminPuzzle(wire);
    } catch (error) {
      throw toPlatformError(error);
    }
  }

  async updatePuzzle(id: string, input: UpdatePuzzleInput): Promise<AdminPuzzle> {
    const body: WireUpdatePuzzleRequest = {
      version: input.version,
      puzzle_date: input.puzzleDate,
      title: input.title,
      prompt_markdown: input.promptMarkdown,
      language: input.language,
      code: input.code,
      buggy_line: input.buggyLine,
      explanation_markdown: input.explanationMarkdown,
    };
    try {
      const wire = await firstValueFrom(
        this.http.patch<WireAdminPuzzle>(
          `${this.baseUrl}/admin/puzzles/${encodeURIComponent(id)}`,
          body,
        ),
      );
      return toAdminPuzzle(wire);
    } catch (error) {
      throw toPlatformError(error);
    }
  }

  async deletePuzzle(id: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete<void>(`${this.baseUrl}/admin/puzzles/${encodeURIComponent(id)}`),
      );
    } catch (error) {
      throw toPlatformError(error);
    }
  }

  /**
   * The one method behind three endpoints (`submit`, `approve`, `reject`):
   * `action` is the path segment, and the request body every transition
   * shares is identical.
   */
  async transitionPuzzle(
    id: string,
    action: PuzzleTransitionAction,
    input: PuzzleTransitionInput,
  ): Promise<AdminPuzzle> {
    const body: WirePuzzleTransitionRequest = {
      expected_status: input.expectedStatus,
      reason: input.reason,
    };
    try {
      const wire = await firstValueFrom(
        this.http.post<WireAdminPuzzle>(
          `${this.baseUrl}/admin/puzzles/${encodeURIComponent(id)}/${action}`,
          body,
        ),
      );
      return toAdminPuzzle(wire);
    } catch (error) {
      throw toPlatformError(error);
    }
  }

  async listAuditLog(id: string, query: PuzzlePageQuery): Promise<Page<PuzzleAuditLogItem>> {
    const params = buildParams({ page: query.page, size: query.size });
    try {
      const page = await firstValueFrom(
        this.http.get<WirePage<WirePuzzleAuditLogItem>>(
          `${this.baseUrl}/admin/puzzles/${encodeURIComponent(id)}/audit-log`,
          { params },
        ),
      );
      return toPage(page, toAuditLogItem);
    } catch (error) {
      throw toPlatformError(error);
    }
  }
}

// ---- Wire → model mapping -----------------------------------------------------

function toAdminPuzzle(wire: WireAdminPuzzle): AdminPuzzle {
  return {
    id: wire.id,
    status: wire.status,
    puzzleDate: wire.puzzle_date,
    title: wire.title,
    promptMarkdown: wire.prompt_markdown,
    language: wire.language,
    code: wire.code,
    lineCount: wire.line_count,
    buggyLine: wire.buggy_line,
    explanationMarkdown: wire.explanation_markdown,
    createdBy: wire.created_by,
    publishedAt: wire.published_at,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
    version: wire.version,
  };
}

function toAuditLogItem(wire: WirePuzzleAuditLogItem): PuzzleAuditLogItem {
  return {
    id: wire.id,
    step: wire.step,
    actorUserId: wire.actor_user_id,
    fromStatus: wire.from_status,
    toStatus: wire.to_status,
    reason: wire.reason,
    occurredAt: wire.occurred_at,
  };
}

function toPage<W, M>(wire: WirePage<W>, mapItem: (item: W) => M): Page<M> {
  return {
    items: wire.items.map(mapItem),
    page: wire.page,
    size: wire.size,
    totalElements: wire.total_elements,
    totalPages: wire.total_pages,
  };
}

/**
 * Builds query params from a plain object, skipping `undefined` entries and
 * appending an array as one repeated param — the shape `sort` needs, since
 * the server accepts it more than once in one request.
 */
function buildParams(
  entries: Readonly<Record<string, string | number | boolean | readonly string[] | undefined>>,
): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        params = params.append(key, entry);
      }
    } else {
      params = params.set(key, value as string | number | boolean);
    }
  }
  return params;
}

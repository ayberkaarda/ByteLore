package dev.bytelore.server.puzzle.admin;

import dev.bytelore.server.auth.AccessTokenClaims;
import dev.bytelore.server.common.PageResponse;
import dev.bytelore.server.puzzle.admin.dto.AdminPuzzleResponse;
import dev.bytelore.server.puzzle.admin.dto.CreatePuzzleRequest;
import dev.bytelore.server.puzzle.admin.dto.PuzzleAuditLogItemResponse;
import dev.bytelore.server.puzzle.admin.dto.PuzzleTransitionRequest;
import dev.bytelore.server.puzzle.admin.dto.UpdatePuzzleRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /admin/puzzles}: authoring and review of the daily bug hunt.
 *
 * <p>Role enforcement lives in the security configuration -- {@code EDITOR}/{@code ADMIN} for
 * authoring and for reading the queue, {@code ADMIN} only for {@code approve} and {@code reject}.
 * An editor can therefore write a puzzle and recommend it, and somebody else decides whether the
 * whole platform sees it.
 */
@RestController
@RequestMapping("/api/v1/admin/puzzles")
public class AdminPuzzleController {

  private final AdminPuzzleService service;

  public AdminPuzzleController(AdminPuzzleService service) {
    this.service = service;
  }

  @PostMapping
  public ResponseEntity<AdminPuzzleResponse> create(
      @Valid @RequestBody CreatePuzzleRequest request,
      @AuthenticationPrincipal AccessTokenClaims caller) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request, caller.userId()));
  }

  @GetMapping
  public PageResponse<AdminPuzzleResponse> list(
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size,
      @RequestParam(required = false) List<String> sort,
      @RequestParam(required = false) String status,
      @RequestParam(required = false) String q) {
    return service.list(page, size, sort, status, q);
  }

  /**
   * The puzzles waiting for a decision. A separate path from the blog's own review queue rather
   * than a filter on it: the two carry different shapes and a reviewer needs the answer line here,
   * which no blog post has.
   */
  @GetMapping("/review-queue")
  public PageResponse<AdminPuzzleResponse> reviewQueue(
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size,
      @RequestParam(required = false) List<String> sort) {
    return service.reviewQueue(page, size, sort);
  }

  @GetMapping("/{id}")
  public AdminPuzzleResponse get(@PathVariable UUID id) {
    return service.get(id);
  }

  @PatchMapping("/{id}")
  public AdminPuzzleResponse update(
      @PathVariable UUID id,
      @Valid @RequestBody UpdatePuzzleRequest request,
      @AuthenticationPrincipal AccessTokenClaims caller) {
    return service.update(id, request, caller.userId());
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable UUID id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/{id}/submit")
  public AdminPuzzleResponse submit(
      @PathVariable UUID id,
      @Valid @RequestBody PuzzleTransitionRequest request,
      @AuthenticationPrincipal AccessTokenClaims caller) {
    return service.submit(id, request, caller.userId());
  }

  @PostMapping("/{id}/approve")
  public AdminPuzzleResponse approve(
      @PathVariable UUID id,
      @Valid @RequestBody PuzzleTransitionRequest request,
      @AuthenticationPrincipal AccessTokenClaims caller) {
    return service.approve(id, request, caller.userId());
  }

  @PostMapping("/{id}/reject")
  public AdminPuzzleResponse reject(
      @PathVariable UUID id,
      @Valid @RequestBody PuzzleTransitionRequest request,
      @AuthenticationPrincipal AccessTokenClaims caller) {
    return service.reject(id, request, caller.userId());
  }

  @GetMapping("/{id}/audit-log")
  public PageResponse<PuzzleAuditLogItemResponse> auditLog(
      @PathVariable UUID id,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size) {
    return service.auditLog(id, page, size);
  }
}

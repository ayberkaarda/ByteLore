import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthSession } from '../../core/auth/auth-session';
import { LocalizedNav } from '../../core/nav/localized-nav';

/**
 * The tab chrome every `/admin` screen sits inside: Posts, Review, and —
 * `ADMIN` only — Sources, above a `router-outlet` for whichever child route
 * is active.
 *
 * The Sources tab is absent rather than disabled for an `EDITOR`, the same
 * choice the review screen makes for its approve/reject controls: a control
 * an `EDITOR` cannot use is not shown as a control at all. Reaching
 * `sources` directly (a typed URL, a stale bookmark) is still stopped by
 * `admin.routes.ts`'s own `requireRole(['ADMIN'])` on those routes — this
 * tab list is a navigation aid, not the access boundary.
 */
@Component({
  selector: 'app-admin-shell-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  templateUrl: './admin-shell.page.html',
})
export class AdminShellPage {
  /** Prefixes the language segment onto link targets where the build has one. */
  protected readonly nav = inject(LocalizedNav);

  protected readonly session = inject(AuthSession);
}

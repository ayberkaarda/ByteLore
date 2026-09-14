import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalizedNav } from '../../core/nav/localized-nav';

/**
 * Where `requireRole` sends a signed-in reader whose role is too narrow for
 * the route they asked for (`role.guard.ts`).
 *
 * Deliberately not a 404: the admin area's existence is not a secret, so
 * pretending the page does not exist would be a worse answer than saying
 * plainly that this account's role does not reach it.
 */
@Component({
  selector: 'app-admin-forbidden-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  template: `
    <h1 class="text-2xl font-semibold tracking-tight">
      {{ 'admin.forbidden.heading' | translate }}
    </h1>
    <p class="mt-2 text-text-muted">{{ 'admin.forbidden.description' | translate }}</p>
    <a
      class="mt-6 inline-block rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-contrast no-underline"
      [routerLink]="nav.commands(['/tracks'])"
    >
      {{ 'admin.forbidden.backToTracks' | translate }}
    </a>
  `,
})
export class AdminForbiddenPage {
  /** Prefixes the language segment onto link targets where the build has one. */
  protected readonly nav = inject(LocalizedNav);
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthSession } from '../../core/auth/auth-session';
import { LanguageSwitcher } from '../../shared/language-switcher';
import { SessionMenu } from '../../shared/session-menu';
import { ThemeSelect } from '../../shared/theme-select';

/**
 * Where the preferences a person sets once actually live.
 *
 * The screen owns no preference logic of its own. Each control already knows
 * how to read and write the thing it names — the language switcher through
 * the locale service, the select through the theme service, the session menu
 * through the session — so this page is a place for them rather than a second
 * implementation of them. A copy of that logic here would be a second answer
 * to the same question, and the two would disagree the first time either
 * moved.
 *
 * The theme is also reachable from the header, but as a different control
 * with a different job: the header keeps a two-state toggle flipped with the
 * time of day, while this page hosts the full three-value select so a choice
 * to go back to following the system has somewhere to be made. Two controls,
 * one service — neither keeps a state of its own to fall out of step.
 */
@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, LanguageSwitcher, SessionMenu, ThemeSelect],
  template: `
    <h1 class="text-3xl font-semibold leading-tight tracking-tight">
      {{ 'settings.heading' | translate }}
    </h1>
    <p class="mt-2 text-text-muted">{{ 'settings.intro' | translate }}</p>

    <div class="mt-8 flex flex-col gap-4">
      <section
        class="rounded-lg border border-border bg-surface p-4"
        data-testid="settings-language"
        aria-labelledby="settings-language-heading"
      >
        <h2 id="settings-language-heading" class="text-sm font-semibold">
          {{ 'settings.language' | translate }}
        </h2>
        <div class="mt-3">
          <app-language-switcher />
        </div>
      </section>

      <section
        class="rounded-lg border border-border bg-surface p-4"
        data-testid="settings-theme"
        aria-labelledby="settings-theme-heading"
      >
        <h2 id="settings-theme-heading" class="text-sm font-semibold">
          {{ 'settings.theme' | translate }}
        </h2>
        <div class="mt-3">
          <app-theme-select />
        </div>
      </section>

      <section
        class="rounded-lg border border-border bg-surface p-4"
        data-testid="settings-account"
        aria-labelledby="settings-account-heading"
      >
        <h2 id="settings-account-heading" class="text-sm font-semibold">
          {{ 'settings.account' | translate }}
        </h2>
        <div class="mt-3">
          <!--
            Nobody signed in is a complete state rather than an incomplete
            one — reading and downloading need no account — so this offers a
            way in instead of reporting something missing.

            It is drawn like the sign-out button it stands in for: a control
            edge and a resting fill, not the accent colour, which belongs to
            the one action a screen exists for. The edge is the strong line
            weight, because the divider colour it used before is only 1.30:1
            against the card behind it and cannot be read as a boundary.
          -->
          @if (session.user() === null) {
            <a
              class="inline-block rounded-md border border-border-strong bg-surface-raised px-3 py-2 text-sm font-medium text-text no-underline hover:bg-surface-hover"
              routerLink="/login"
              data-testid="settings-sign-in"
            >
              {{ 'nav.signIn' | translate }}
            </a>
          } @else {
            <app-session-menu />
          }
        </div>
      </section>
    </div>
  `,
})
export class SettingsPage {
  protected readonly session = inject(AuthSession);
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ThemeService } from '../core/theme/theme.service';
import type { ThemePreference } from '../core/platform/models';

/**
 * Full control over the three-value theme preference, including the way back
 * to following the system.
 *
 * The header keeps a two-state toggle on purpose (see `ThemeToggle`) — it is
 * flipped with the time of day, and cycling a third value through a control
 * that small would leave one press in three with no visible effect. This is
 * the other place the same preference is reachable: a select wide enough to
 * name all three values, so a choice to go back to "whatever the system says"
 * has a way to say so again. Both controls read and write the same service,
 * so there is no state of their own to keep in step.
 *
 * Modeled on the language switcher: same element, same shared `.bl-select`
 * look, same reason for staying a native select instead of a hand-built
 * listbox — its keyboard and screen reader behaviour comes for free.
 */
@Component({
  selector: 'app-theme-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <label class="sr-only" for="theme-select">{{ 'settings.theme' | translate }}</label>
    <select
      id="theme-select"
      class="bl-select"
      [attr.aria-label]="'settings.theme' | translate"
      [value]="theme.preference()"
      (change)="select($event)"
    >
      <option value="SYSTEM" [selected]="theme.preference() === 'SYSTEM'">
        {{ 'theme.system' | translate }}
      </option>
      <option value="LIGHT" [selected]="theme.preference() === 'LIGHT'">
        {{ 'theme.light' | translate }}
      </option>
      <option value="DARK" [selected]="theme.preference() === 'DARK'">
        {{ 'theme.dark' | translate }}
      </option>
    </select>
  `,
})
export class ThemeSelect {
  protected readonly theme = inject(ThemeService);

  protected select(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as ThemePreference;
    void this.theme.set(value);
  }
}

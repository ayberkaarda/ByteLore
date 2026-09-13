import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ThemeService } from '../core/theme/theme.service';

/**
 * A two-state control over a three-value preference.
 *
 * It reports what is on screen, not what was stored: with the preference set
 * to follow the system, `aria-pressed` still answers the question a user
 * actually asked, which is whether the dark palette is currently on.
 *
 * The accessible name is built from a hidden purpose plus the visible word
 * rather than replacing the visible word with an `aria-label`. Someone driving
 * the interface by voice says what they can see — "click Dark" — and a name
 * that does not contain the visible label leaves that command with nothing to
 * match.
 *
 * Drawn at the lightest interactive weight there is — colour and a hover fill,
 * no edge and no resting fill. It is a preference someone flips with the time
 * of day, and it sits in the header on every screen; an edge or a fill would
 * give it the presence of an action it does not have. It keeps the ordinary
 * text size rather than the smaller one used for actions packed into a table
 * row, because it is also the sole control of its section on the settings
 * screen, where it stands beside a full-height language field.
 */
@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <button
      type="button"
      class="rounded-md px-3 py-2 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text"
      [attr.aria-pressed]="theme.resolved() === 'dark'"
      [title]="'theme.toggle' | translate"
      data-testid="theme-toggle"
      (click)="toggle()"
    >
      <span class="sr-only">{{ 'theme.toggle' | translate }}</span>
      {{ (theme.resolved() === 'dark' ? 'theme.dark' : 'theme.light') | translate }}
    </button>
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);

  protected toggle(): void {
    void this.theme.toggle();
  }
}

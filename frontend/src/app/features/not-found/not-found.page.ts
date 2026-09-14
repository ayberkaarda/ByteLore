import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalizedNav } from '../../core/nav/localized-nav';

@Component({
  selector: 'app-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  template: `
    <div class="mx-auto w-full max-w-3xl">
      <h1 class="text-3xl font-semibold leading-tight tracking-tight">
        {{ 'notFound.heading' | translate }}
      </h1>
      <p class="mt-2 text-text-muted">{{ 'notFound.description' | translate }}</p>
      <a
        class="mt-6 inline-block rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-contrast no-underline"
        [routerLink]="nav.commands(['/tracks'])"
      >
        {{ 'notFound.backHome' | translate }}
      </a>
    </div>
  `,
})
export class NotFoundPage {
  /** Prefixes the language segment onto link targets where the build has one. */
  protected readonly nav = inject(LocalizedNav);
}

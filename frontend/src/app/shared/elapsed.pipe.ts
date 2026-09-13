import { Pipe, PipeTransform, inject } from '@angular/core';

import { ActiveLocale } from '../core/i18n/active-locale';

/**
 * Formats a duration in milliseconds as `m:ss.t`, in the active interface
 * locale.
 *
 * A stopwatch reading rather than a sentence, because that is what it is
 * compared against: the scoreboard puts these in a column, and "1 minute 4
 * seconds" in four languages cannot be scanned down a column the way `1:04.3`
 * can. The digits come from `Intl.NumberFormat`, so the decimal mark is the
 * one the reader's language uses — `1:04,3` in German — and the seconds are
 * zero-padded to two places by the formatter itself rather than by string
 * arithmetic that would not know what a digit looks like in every locale.
 *
 * Tenths are the finest unit shown. The number is measured on the player's
 * own device and orders a scoreboard; a millisecond of it would be precision
 * the measurement does not have.
 */
@Pipe({ name: 'elapsed', pure: false })
export class ElapsedPipe implements PipeTransform {
  private readonly activeLocale = inject(ActiveLocale);

  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '';
    }
    const locale = this.activeLocale.value();
    // Converted to whole tenths-of-a-second in one division and kept as
    // integers from there on. Deriving minutes and seconds by subtracting
    // scaled floating-point seconds (`totalSeconds - minutes * 60`) hits IEEE
    // 754 cancellation — e.g. 60.3 - 60 evaluates to 0.29999999999999972 in
    // JS — which then truncates down to the wrong tenth. Integer subtraction
    // has no such error, so the tenth shown always matches the tenth held.
    const totalTenths = Math.floor(Math.max(0, value) / 100);
    const minutes = Math.floor(totalTenths / 600);
    // Truncated to tenths rather than rounded to them: rounding 59.97 seconds
    // up produces "0:60.0", a reading no stopwatch has ever shown. The floor
    // above already performs that truncation, once, at the finest unit shown.
    const secondsTenths = totalTenths - minutes * 600;
    const seconds = Math.floor(secondsTenths / 10) + (secondsTenths % 10) / 10;
    const minutesText = new Intl.NumberFormat(locale, { useGrouping: false }).format(minutes);
    const secondsText = new Intl.NumberFormat(locale, {
      minimumIntegerDigits: 2,
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      useGrouping: false,
    }).format(seconds);
    return `${minutesText}:${secondsText}`;
  }
}

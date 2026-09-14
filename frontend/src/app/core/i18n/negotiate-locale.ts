import { LOCALES, type Locale } from '../platform/models';

/**
 * Picks a supported interface locale out of the languages a browser asks for.
 *
 * Only the primary subtag is compared, so `fr-CA` and `de-AT` are answered
 * with the language this application actually has a catalogue for rather than
 * missed for want of a regional variant. The list is walked in order because
 * the browser already ranks it by preference.
 *
 * Returns `null` when nothing matches, which is a different answer from "the
 * reader wants English": the caller decides what to do with no preference, and
 * conflating the two would hide which of the two happened.
 */
export function negotiateLocale(languages: readonly string[]): Locale | null {
  for (const tag of languages) {
    const primary = tag.split('-')[0]?.toLowerCase();
    const match = LOCALES.find((locale) => locale === primary);
    if (match !== undefined) {
      return match;
    }
  }
  return null;
}

import { negotiateLocale } from './negotiate-locale';

describe('negotiateLocale', () => {
  it('answers a regional variant with the language there is a catalogue for', () => {
    // `fr-CA` is French as far as the interface is concerned; missing it for
    // want of a regional variant would send a French reader to English.
    expect(negotiateLocale(['fr-CA'])).toBe('fr');
    expect(negotiateLocale(['DE-at'])).toBe('de');
  });

  it('honours the order the browser ranked them in', () => {
    expect(negotiateLocale(['es', 'tr', 'de'])).toBe('tr');
  });

  it('reports no preference rather than guessing English', () => {
    // "Nothing matched" and "English was asked for" are different facts, and
    // the caller decides what to do with the first. Collapsing them here would
    // hide which of the two happened.
    expect(negotiateLocale(['es', 'it'])).toBeNull();
    expect(negotiateLocale([])).toBeNull();
  });
});

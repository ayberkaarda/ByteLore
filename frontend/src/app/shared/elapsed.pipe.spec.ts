import { TestBed } from '@angular/core/testing';

import { ActiveLocale } from '../core/i18n/active-locale';
import { ElapsedPipe } from './elapsed.pipe';

describe('ElapsedPipe', () => {
  let locale: ActiveLocale;
  let pipe: ElapsedPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ElapsedPipe] });
    locale = TestBed.inject(ActiveLocale);
    pipe = TestBed.inject(ElapsedPipe);
  });

  it('reads a duration as a stopwatch does', () => {
    expect(pipe.transform(0)).toBe('0:00.0');
    expect(pipe.transform(9_400)).toBe('0:09.4');
    expect(pipe.transform(64_200)).toBe('1:04.2');
    expect(pipe.transform(3_723_900)).toBe('62:03.9');
  });

  it('truncates to tenths rather than rounding into a sixtieth second', () => {
    // Rounding 59.97 seconds up produces "0:60.0", a reading no stopwatch
    // has ever shown.
    expect(pipe.transform(59_970)).toBe('0:59.9');
  });

  it('uses the decimal mark of the interface language', () => {
    locale.set('de');
    expect(pipe.transform(64_200)).toBe('1:04,2');
  });

  it('renders nothing for a duration that is not there', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform(Number.NaN)).toBe('');
  });
});

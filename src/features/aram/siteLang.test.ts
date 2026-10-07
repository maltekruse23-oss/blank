import { describe, expect, it } from 'vitest';
import {
  agoIn,
  english,
  href,
  langOf,
  numberIn,
  seasonIn,
  switchTo,
  text,
} from '../../../apps/mayhem-site/app/ui/lang';

describe('website languages', () => {
  it('reads the language from the address', () => {
    expect(langOf('/')).toBe('en');
    expect(langOf('/leaderboard')).toBe('en');
    expect(langOf('/de')).toBe('de');
    expect(langOf('/de/rangliste?season=x')).toBe('de');
    expect(langOf('/de?x=1')).toBe('de');
    expect(langOf('/demo')).toBe('en');
    expect(langOf('/players/de-EUW')).toBe('en');
  });

  it('turns English addresses into German ones', () => {
    expect(href('en', '/leaderboard')).toBe('/leaderboard');
    expect(href('de', '/')).toBe('/de');
    expect(href('de', '/?x=1')).toBe('/de?x=1');
    expect(href('de', '/leaderboard?server=euw')).toBe('/de/rangliste?server=euw');
    expect(href('de', '/game/5?p=a1')).toBe('/de/spiel/5?p=a1');
    expect(href('de', '/privacy/remove?game=5')).toBe('/de/datenschutz/entfernen?game=5');
    expect(href('de', '/scoring#note')).toBe('/de/wertung#note');
    expect(href('de', '/champions/Ashe')).toBe('/de/champions/Ashe');
    // Only the page's own subpages are renamed: a player called "remove" stays.
    expect(href('de', '/players/remove')).toBe('/de/players/remove');
    expect(href('de', '/api/export')).toBe('/api/export');
    expect(href('de', 'https://example.org/x')).toBe('https://example.org/x');
  });

  it('switches the same page between languages', () => {
    expect(english('/de/spiel/5?p=a1')).toBe('/game/5?p=a1');
    expect(english('/de')).toBe('/');
    expect(english('/de/datenschutz/entfernen')).toBe('/privacy/remove');
    expect(switchTo('/de/rangliste?server=na', 'en')).toBe('/leaderboard?server=na');
    expect(switchTo('/tier-list', 'de')).toBe('/de/tierliste');
    expect(switchTo('/players/Name-EUW', 'de')).toBe('/de/players/Name-EUW');
    expect(switchTo('/de/players/Name-EUW', 'de')).toBe('/de/players/Name-EUW');
  });

  it('formats in the language', () => {
    expect(text('en')('Leaderboard', 'Rangliste')).toBe('Leaderboard');
    expect(text('de')('Leaderboard', 'Rangliste')).toBe('Rangliste');
    expect(numberIn('en')(12345.6, 1)).toBe('12,345.6');
    expect(numberIn('de')(12345.6, 1)).toBe('12.345,6');
    expect(seasonIn('en')({ year: 2026, number: 3 })).toBe('Season 3 · 2026');
    expect(seasonIn('de')({ year: 2026, number: 3 })).toBe('Saison 3 · 2026');
    expect(agoIn('en')(0, 5 * 60000)).toBe('5 min ago');
    expect(agoIn('de')(0, 2 * 86400000)).toBe('vor 2 Tagen');
  });
});

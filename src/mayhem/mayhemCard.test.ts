import { describe, expect, it } from 'vitest';
import { DDRAGON_VERSION } from '../data/proStreamers';
import { number as deNumber, percent as dePercent } from '../features/aram/format';
import { games, number, percent, winsIn } from './format';
import { itemImage } from './MayhemCard';

// The Mayhem app is English only (format.ts) and takes item pictures from Data Dragon (the only
// image host besides the websites in tauri.mayhem.conf.json's CSP).
describe('Mayhem card', () => {
  it('counts games in English, singular only for one', () => {
    expect(games(0)).toBe('0 games');
    expect(games(1)).toBe('1 game');
    expect(games(2)).toBe('2 games');
    expect(games(12345)).toBe('12,345 games');
  });

  it('writes numbers and rates in English, blank. keeps German', () => {
    expect([number(1948.4), percent(0.5661), winsIn(0.6, 298)]).toEqual([
      '1,948',
      '57%',
      '60% wins in 298 games',
    ]);
    expect([deNumber(1948.4), dePercent(0.5661)]).toEqual(['1.948', '57 %']);
  });

  it('takes item pictures from Data Dragon in the pinned version', () => {
    expect(itemImage(3089)).toBe(
      `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/3089.png`,
    );
  });
});

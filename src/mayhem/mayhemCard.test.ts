import { describe, expect, it } from 'vitest';
import { DDRAGON_VERSION } from '../data/proStreamers';
import { games, itemImage } from './MayhemCard';

// The Mayhem app's card (MayhemCard.tsx): game counts in German and item pictures from Data Dragon
// (the only image host besides the website in tauri.mayhem.conf.json's CSP).
describe('Mayhem card', () => {
  it('counts games in German, singular only for one', () => {
    expect(games(0)).toBe('0 Spiele');
    expect(games(1)).toBe('1 Spiel');
    expect(games(2)).toBe('2 Spiele');
    expect(games(12345)).toBe('12.345 Spiele');
  });

  it('takes item pictures from Data Dragon in the pinned version', () => {
    expect(itemImage(3089)).toBe(
      `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/3089.png`,
    );
  });
});

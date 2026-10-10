import { describe, expect, it } from 'vitest';
import { parsePage } from './skill-orders.ts';

// Trimmed from aramkit.com/en-US/champions/kayle (10.10.2026): ability buttons cut to their key.
const keys = (order: string) =>
  order
    .split('>')
    .map((k) => `<span class="skill-key">${k}</span>`)
    .join('<span class="skill-separator">&gt;</span>');
const label = (order: string) => order.replace(/>/g, '&gt;');
const row = (n: number, order: string, win: string, pick: string) =>
  `<div class="detail-list-row"><span class="rank-cell detail-rank-cell">#${n}</span><span class="sample-warning-label"><strong class="skill-order" aria-label="${label(order)}">${keys(order)}</strong></span><span class="row-stat"><strong>${win}%</strong><small>Win rate</small></span><span class="row-stat"><strong>${pick}%</strong><small>Pick rate</small></span><span class="row-stat stat-benefit" data-tone="positive"><strong>+1.0%</strong><small>Win lift</small></span></div>`;
const summary = `<div class="champion-summary-pick"><span class="sample-warning-label"><span>Best skill order</span></span><strong class="skill-order summary-skill-order" aria-label="E&gt;W&gt;Q">${keys('E>W>Q')}</strong><div class="summary-pick-stats"><span><small>Win rate</small><strong>58.4%</strong></span><span><small>Pick rate</small><strong>21.7%</strong></span></div></div>`;
const builds = `<div role="button" class="active detail-list-row profile-row"><span class="rank-cell detail-rank-cell">#1</span><span class="row-stat"><strong>63.4%</strong><small>Win rate</small></span><span class="row-stat"><strong>35.1%</strong><small>Pick rate</small></span></div>`;
const config = `<script>window.__NUXT__.config={public:{aramKitDataVersions:{latest:"16.19",versions:[{version:"16.19",dataPath:"data/16.19-20261008-4001b809d48b",allMatches:32628818,dataDate:"2026-10-08"},{version:"16.18",dataPath:"data/16.18-20260922-67a88c3fcc6c",dataDate:"2026-09-22"}]}}}</script>`;
const kayle = [
  summary,
  row(1, 'E>W>Q', '58.4', '21.7'),
  row(2, 'W>E>Q', '57.2', '1.0'),
  row(3, 'E>Q>W', '56.2', '64.1'),
  row(4, 'Q>E>W', '55.4', '12.1'),
  row(5, 'Q>W>E', '55.3', '1.0'),
  builds,
  config,
].join('');

describe('aramkit skill orders', () => {
  it('reads the max orders: summary skipped, at least 5 % pick, top 3 by pick rate', () => {
    expect(parsePage(kayle)).toEqual({
      patch: '16.19',
      date: '2026-10-08',
      orders: [
        { order: 'E>Q>W', pick: 0.641, win: 0.562 },
        { order: 'E>W>Q', pick: 0.217, win: 0.584 },
        { order: 'Q>E>W', pick: 0.121, win: 0.554 },
      ],
    });
  });

  it('skips orders that are not Q, W, E once each', () => {
    const page = parsePage(
      [
        row(1, 'R>Q>W', '60.0', '50.0'),
        row(2, 'Q>Q>W', '60.0', '30.0'),
        row(3, 'Q>W>E', '50.0', '20.0'),
        config,
      ].join(''),
    );
    expect(page?.orders).toEqual([{ order: 'Q>W>E', pick: 0.2, win: 0.5 }]);
  });

  it('has no orders when the unlisted players could hold the most picked one', () => {
    // aramkit lists at most 5 orders, by win rate: Malphite's usual Q>E>W (~66 %) is cut.
    const malphite = [
      row(1, 'W>E>Q', '55.0', '8.4'),
      row(2, 'W>Q>E', '54.0', '4.7'),
      row(3, 'E>W>Q', '53.0', '5.8'),
      row(4, 'Q>W>E', '52.0', '6.8'),
      row(5, 'E>Q>W', '51.0', '8.3'),
      config,
    ].join('');
    expect(parsePage(malphite)).toEqual({ patch: '16.19', date: '2026-10-08', orders: [] });
    // 21.5 % unlisted but 59 % on the top order: it is the most picked whatever is missing.
    const annie = [row(1, 'Q>E>W', '51.0', '19.5'), row(2, 'Q>W>E', '50.0', '59.0'), config];
    expect(parsePage(annie.join(''))?.orders.map((o) => o.order)).toEqual(['Q>W>E', 'Q>E>W']);
  });

  it("never takes the next list's numbers for a row without its own", () => {
    const bare = `<div class="detail-list-row"><strong class="skill-order" aria-label="E&gt;Q&gt;W">${keys('E>Q>W')}</strong></div>`;
    expect(parsePage(bare + builds + config)).toBeNull();
  });

  it('is null without the data version or without rows', () => {
    expect(parsePage(row(1, 'E>Q>W', '56.2', '64.1'))).toBeNull();
    expect(parsePage(summary + builds + config)).toBeNull();
  });
});

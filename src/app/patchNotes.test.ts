import { describe, expect, it } from 'vitest';
import notes from '../../.github/release-notes.md?raw';
import { newsItems } from './releaseNotes';

describe('Neuigkeiten nach Updates', () => {
  it('liest den Abschnitt „Neu in dieser Version“ der Release-Notizen', () => {
    const items = newsItems(notes);
    expect(items.length).toBeGreaterThanOrEqual(5);
    for (const item of items) expect(item).toMatch(/^\*\*[^*]+:\*\* /);
  });

  it('ohne Abschnitt: nichts; hört beim nächsten Abschnitt auf', () => {
    expect(newsItems('## Anderes\n\n- nicht das')).toEqual([]);
    expect(newsItems('## Neu in dieser Version\n\n- eins\n- zwei\n\n## So geht\n\n- drei')).toEqual(
      ['eins', 'zwei'],
    );
  });
});

import { describe, expect, it } from 'vitest';
import notes from '../../.github/release-notes.md?raw';
import { MAYHEM_NEWS, newsItems } from '../app/releaseNotes';
import { updateView } from './updateView';

const info = (latest: string, available: boolean) => ({
  current: '0.9.2',
  latest,
  available,
  notes: [],
});

describe('Mayhem update dialog', () => {
  it('says each state in English with one main button', () => {
    expect(updateView({ status: 'unavailable' }, true)).toMatchObject({ action: null });
    expect(updateView({ status: 'checking' }, true).title).toBe('Checking for updates');
    expect(updateView({ status: 'ready', info: info('0.9.2', false) }, true)).toMatchObject({
      title: "You're up to date",
      text: 'Version 0.9.2 is the latest.',
      action: null,
    });
    expect(updateView({ status: 'ready', info: info('0.9.3', true) }, true)).toMatchObject({
      title: 'Version 0.9.3 is available',
      action: 'install',
    });
    expect(updateView({ status: 'installing', latest: '0.9.3', percent: 40 }, true)).toMatchObject({
      title: 'Downloading version 0.9.3',
      percent: 40,
      action: null,
    });
  });

  it('failed: the message and "try again"; offline says so instead', () => {
    const failed = { status: 'error', message: 'The download failed.' } as const;
    expect(updateView(failed, true)).toMatchObject({
      title: 'Update failed',
      text: 'The download failed.',
      action: 'retry',
    });
    expect(updateView(failed, false)).toMatchObject({ title: "You're offline", action: 'retry' });
  });

  it('the release text has English notes for after the update', () => {
    const items = newsItems(notes, MAYHEM_NEWS);
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const item of items) expect(item).toMatch(/^\*\*[^*]+:\*\* /);
    // blank.'s German news stay apart.
    expect(newsItems(notes)).not.toEqual(items);
  });
});

import type { ReactNode } from 'react';

/** The release text's sections that the apps show (.github/release-notes.md, built in): blank.'s
 * German news (PatchNotes.tsx) and the Mayhem app's English ones (update.rs reads the same
 * section from GitHub before an update). */
export const BLANK_NEWS = '## Neu in dieser Version';
export const MAYHEM_NEWS = '## New in the Mayhem app';

/** The "- " lines of a section, up to the next one. */
export const newsItems = (text: string, heading = BLANK_NEWS) => {
  const start = text.indexOf(heading);
  if (start < 0) return [];
  const rest = text.slice(start).split('\n').slice(1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end))
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
};

/** **bold** and `code` of the release text as elements (no HTML from the text). */
export function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .map((part, i) =>
      part.startsWith('**') ? (
        <b key={i}>{part.slice(2, -2)}</b>
      ) : part.startsWith('`') ? (
        <code key={i}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

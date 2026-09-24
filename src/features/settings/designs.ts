// App designs (Settings → Darstellung → Design), set as data-design on <html>. "arena" has its own
// colours (src/styles/tokens.css) and look (src/styles/arena.css); the colour schemes apply to
// "classic" only.
export const designs = [
  { id: 'classic', name: 'Klassisch' },
  { id: 'arena', name: 'Arena' },
] as const;

export type DesignId = (typeof designs)[number]['id'];

export function isDesignId(value: unknown): value is DesignId {
  return designs.some((d) => d.id === value);
}

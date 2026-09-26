// App designs (Settings → Darstellung → Design), set as data-design on <html>. All but "classic"
// have their own colours (src/styles/tokens.css) and look (src/styles/<design>.css); the colour
// schemes apply to "classic" only. "clear" and "bento" also move the navigation (tabs at the top,
// dock at the bottom); the page content stays the same.
export const designs = [
  { id: 'classic', name: 'Klassisch' },
  { id: 'arena', name: 'Arena' },
  { id: 'clear', name: 'Klar' },
  { id: 'hud', name: 'HUD' },
  { id: 'bento', name: 'Bento' },
  { id: 'void', name: 'Void' },
  { id: 'orbit', name: 'Orbit' },
  { id: 'axiom', name: 'Axiom' },
] as const;

export type DesignId = (typeof designs)[number]['id'];

export function isDesignId(value: unknown): value is DesignId {
  return designs.some((d) => d.id === value);
}

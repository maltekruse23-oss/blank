// Colour schemes; the colours themselves are in src/styles/tokens.css ([data-theme='…']).
export const themes = [
  { id: 'forest', name: 'Wald' },
  { id: 'ocean', name: 'Ozean' },
  { id: 'lavender', name: 'Lavendel' },
  { id: 'ember', name: 'Glut' },
  { id: 'rose', name: 'Rosé' },
  { id: 'graphite', name: 'Graphit' },
] as const;

export type ThemeId = (typeof themes)[number]['id'];

export function isThemeId(value: unknown): value is ThemeId {
  return themes.some((t) => t.id === value);
}

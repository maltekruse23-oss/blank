// Design tokens: every visual value of the app with a name, a kind and the CSS custom property it
// is written to. Existing properties keep their names (--bg, --panel, --accent, …) so the current
// CSS works unchanged; new scales (spacing, radii, shadows, type, motion) get new properties that
// components use as they move to the design system. Values come from themes.ts; see README.md.

export type TokenKind =
  'color' | 'length' | 'shadow' | 'font' | 'number' | 'time' | 'easing' | 'text';

type TokenDef = { css: `--${string}`; kind: TokenKind };

export const tokenDefs = {
  // Colours: surfaces from back to front (app background → panel → surface → hover).
  'color.bg.app': { css: '--bg', kind: 'color' },
  'color.bg.glow': { css: '--glow', kind: 'color' },
  'color.surface.panel': { css: '--panel', kind: 'color' },
  'color.surface.default': { css: '--surface', kind: 'color' },
  'color.surface.hover': { css: '--surface-hover', kind: 'color' },
  'color.border.panel': { css: '--panel-border', kind: 'color' },
  'color.border.default': { css: '--border', kind: 'color' },
  'color.text.primary': { css: '--text', kind: 'color' },
  'color.text.secondary': { css: '--muted', kind: 'color' },
  'color.text.muted': { css: '--subtle', kind: 'color' },
  'color.accent.primary': { css: '--accent', kind: 'color' },
  'color.accent.soft': { css: '--accent-soft', kind: 'color' },
  'color.accent.line': { css: '--accent-line', kind: 'color' },
  'color.accent.ink': { css: '--accent-ink', kind: 'color' },
  'color.status.error': { css: '--danger', kind: 'color' },
  'color.status.errorText': { css: '--danger-text', kind: 'color' },
  'color.scrollbar.thumb': { css: '--scrollbar', kind: 'color' },
  'color.scrollbar.hover': { css: '--scrollbar-hover', kind: 'color' },
  'color.sidebar': { css: '--sidebar', kind: 'color' },
  'color.shadow': { css: '--shadow', kind: 'color' },
  'color.tone.1': { css: '--tone-1', kind: 'color' },
  'color.tone.2': { css: '--tone-2', kind: 'color' },
  'color.tone.3': { css: '--tone-3', kind: 'color' },
  'color.tone.4': { css: '--tone-4', kind: 'color' },
  'color.avatar.0': { css: '--avatar-0', kind: 'color' },
  'color.avatar.0Ink': { css: '--avatar-0-ink', kind: 'color' },
  'color.avatar.1': { css: '--avatar-1', kind: 'color' },
  'color.avatar.1Ink': { css: '--avatar-1-ink', kind: 'color' },
  'color.avatar.2': { css: '--avatar-2', kind: 'color' },
  'color.avatar.2Ink': { css: '--avatar-2-ink', kind: 'color' },
  'color.avatar.3': { css: '--avatar-3', kind: 'color' },
  'color.avatar.3Ink': { css: '--avatar-3-ink', kind: 'color' },
  // ARAM leaderboard: medal colours of the places, and a colour per kind of category.
  'color.rank.1': { css: '--rank-1', kind: 'color' },
  'color.rank.2': { css: '--rank-2', kind: 'color' },
  'color.rank.3': { css: '--rank-3', kind: 'color' },
  'color.rank.rest': { css: '--rank-rest', kind: 'color' },
  'color.game.fire': { css: '--game-fire', kind: 'color' },
  'color.game.magic': { css: '--game-magic', kind: 'color' },
  'color.game.physical': { css: '--game-physical', kind: 'color' },
  'color.game.gold': { css: '--game-gold', kind: 'color' },
  'color.game.guard': { css: '--game-guard', kind: 'color' },

  // Spacing: a 4 px grid; "section" (gap between cards), "card" (inside a card) and "row" (above and
  // below a list row) follow the density.
  'space.xs': { css: '--space-xs', kind: 'length' },
  'space.sm': { css: '--space-sm', kind: 'length' },
  'space.md': { css: '--space-md', kind: 'length' },
  'space.lg': { css: '--space-lg', kind: 'length' },
  'space.xl': { css: '--space-xl', kind: 'length' },
  'space.2xl': { css: '--space-2xl', kind: 'length' },
  'space.section': { css: '--gap', kind: 'length' },
  'space.card': { css: '--space-card', kind: 'length' },
  'space.row': { css: '--space-row', kind: 'length' },

  // Radii; "large" is the existing --radius (the content panel), cards draw with "card".
  'radius.subtle': { css: '--radius-subtle', kind: 'length' },
  'radius.small': { css: '--radius-small', kind: 'length' },
  'radius.control': { css: '--radius-control', kind: 'length' },
  'radius.card': { css: '--radius-card', kind: 'length' },
  'radius.large': { css: '--radius', kind: 'length' },
  'radius.round': { css: '--radius-round', kind: 'length' },
  /** Factor for the radii written directly in the CSS (calc(9px * var(--radius-scale))). */
  'radius.scale': { css: '--radius-scale', kind: 'number' },

  // Shadows from flat to floating.
  'shadow.raised': { css: '--shadow-raised', kind: 'shadow' },
  'shadow.floating': { css: '--shadow-floating', kind: 'shadow' },
  'shadow.overlay': { css: '--shadow-overlay', kind: 'shadow' },

  // Typography: families and sizes of the text roles.
  'font.family': { css: '--font', kind: 'font' },
  'font.display': { css: '--font-display', kind: 'font' },
  'font.mono': { css: '--font-mono', kind: 'font' },
  'text.pageTitle': { css: '--text-page-title', kind: 'length' },
  'text.cardTitle': { css: '--text-card-title', kind: 'length' },
  'text.body': { css: '--text-body', kind: 'length' },
  'text.label': { css: '--text-label', kind: 'length' },
  'text.caption': { css: '--text-caption', kind: 'length' },
  'text.metadata': { css: '--text-metadata', kind: 'length' },
  'text.numeric': { css: '--text-numeric', kind: 'length' },

  // Layout of the fixed window.
  'layout.titlebar': { css: '--titlebar-height', kind: 'length' },

  // Motion for CSS (durations already scaled by the motion setting; see motion.ts).
  'motion.instant': { css: '--motion-instant', kind: 'time' },
  'motion.fast': { css: '--motion-fast', kind: 'time' },
  'motion.normal': { css: '--motion-normal', kind: 'time' },
  'motion.slow': { css: '--motion-slow', kind: 'time' },
  'motion.emphasized': { css: '--motion-emphasized', kind: 'time' },
  /** Delay between items entering one after another (cards of a page). */
  'motion.stagger': { css: '--motion-stagger', kind: 'time' },
  /** 1: movements travel (slide, scale); 0 at "reduced": only fades. */
  'motion.travel': { css: '--motion-travel', kind: 'number' },
  /** The bouncy spring (motion.ts) as CSS easing, and how long it takes to settle. */
  'easing.spring': { css: '--ease-spring', kind: 'easing' },
  'motion.spring': { css: '--motion-spring', kind: 'time' },
  'easing.standard': { css: '--ease-standard', kind: 'easing' },
  'easing.enter': { css: '--ease-enter', kind: 'easing' },
  'easing.exit': { css: '--ease-exit', kind: 'easing' },
  'easing.emphasized': { css: '--ease-emphasized', kind: 'easing' },
} as const satisfies Record<string, TokenDef>;

export type TokenPath = keyof typeof tokenDefs;
export type TokenValues = Record<TokenPath, string>;
export type TokenOverrides = Partial<TokenValues>;

export const tokenPaths = Object.keys(tokenDefs) as TokenPath[];

export const isTokenPath = (value: unknown): value is TokenPath =>
  typeof value === 'string' && value in tokenDefs;

// Themes with inheritance: base (everything that is not colour) → dark → "Klassisch". Colour
// schemes are a layer on top of the theme (only colours). A theme stores only what differs from
// its parent. The values are the ones of src/styles/tokens.css (the first paint before the app
// has run); a test keeps both the same.
import type { ThemeId } from '../features/settings/themes';
import { bouncyCurve } from './motion';
import type { TokenOverrides, TokenValues } from './tokens';

export type ThemeDef = {
  id: string;
  name: string;
  /** The theme this one builds on; only differences are stored. */
  extends?: string;
  tokens: TokenOverrides;
};

const base: ThemeDef = {
  id: 'base',
  name: 'Basis',
  tokens: {
    'space.xs': '4px',
    'space.sm': '8px',
    'space.md': '12px',
    'space.lg': '16px',
    'space.xl': '20px',
    'space.2xl': '24px',
    'space.section': '12px',
    'space.card': '16px',
    'space.row': '9px',
    'radius.subtle': '4px',
    'radius.small': '6px',
    'radius.control': '8px',
    'radius.card': '12px',
    'radius.large': '16px',
    'radius.round': '999px',
    'radius.scale': '1',
    'shadow.raised': '0 4px 10px var(--shadow)',
    'shadow.floating': '0 10px 28px var(--shadow)',
    'shadow.overlay': '0 14px 40px var(--shadow)',
    'font.family': "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
    'font.display': "'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif",
    'font.mono': "'Cascadia Mono', Consolas, ui-monospace, monospace",
    'text.pageTitle': '21px',
    'text.cardTitle': '13px',
    'text.body': '14px',
    'text.label': '13px',
    'text.caption': '11px',
    'text.metadata': '10px',
    'text.numeric': '25px',
    'layout.titlebar': '36px',
    'motion.instant': '0ms',
    'motion.fast': '120ms',
    'motion.normal': '200ms',
    'motion.slow': '320ms',
    'motion.emphasized': '450ms',
    'motion.travel': '1',
    'motion.stagger': '30ms',
    'motion.spring': `${bouncyCurve.ms}ms`,
    'easing.spring': bouncyCurve.easing,
    'easing.standard': 'cubic-bezier(0.2, 0, 0, 1)',
    'easing.enter': 'cubic-bezier(0, 0, 0, 1)',
    'easing.exit': 'cubic-bezier(0.3, 0, 1, 1)',
    'easing.emphasized': 'cubic-bezier(0.2, 0, 0, 1.2)',
  },
};

const dark: ThemeDef = {
  id: 'dark',
  name: 'Dunkel',
  extends: 'base',
  tokens: {
    'color.sidebar': 'transparent',
    'color.status.error': '#b83a32',
    'color.status.errorText': '#e08a80',
    'color.tone.1': 'var(--accent)',
    'color.tone.2': 'var(--accent)',
    'color.tone.3': 'var(--accent)',
    'color.tone.4': 'var(--accent)',
    'color.avatar.1': '#324831',
    'color.avatar.1Ink': '#d7e7cf',
    'color.avatar.2': '#383042',
    'color.avatar.2Ink': '#d4c4e1',
    'color.avatar.3': '#263e47',
    'color.avatar.3Ink': '#b9d9df',
    'color.avatar.0': '#2c322e',
    'color.avatar.0Ink': '#aab1ac',
    'color.shadow': '#000a',
  },
};

/** The one design of the app (user's wish), dark green/black with calm rounded cards. */
const classic: ThemeDef = { id: 'classic', name: 'Klassisch', extends: 'dark', tokens: {} };

export const themeDefs: Record<string, ThemeDef> = { base, dark, classic };
export type DesignThemeId = 'classic';

/** A theme's tokens with everything it inherits; a loop in `extends` stops instead of hanging. */
export function themeTokens(id: string): TokenOverrides {
  const chain: ThemeDef[] = [];
  const seen = new Set<string>();
  for (
    let t: ThemeDef | undefined = themeDefs[id];
    t && !seen.has(t.id);
    t = t.extends ? themeDefs[t.extends] : undefined
  ) {
    seen.add(t.id);
    chain.unshift(t);
  }
  return Object.assign({}, ...chain.map((t) => t.tokens));
}

/** Colour schemes (Settings → Darstellung → Farbe): same lightness and saturation, other hue. */
type Palette = Pick<
  TokenValues,
  | 'color.bg.app'
  | 'color.bg.glow'
  | 'color.surface.panel'
  | 'color.border.panel'
  | 'color.surface.default'
  | 'color.surface.hover'
  | 'color.border.default'
  | 'color.text.primary'
  | 'color.text.secondary'
  | 'color.text.muted'
  | 'color.scrollbar.thumb'
  | 'color.scrollbar.hover'
  | 'color.accent.primary'
  | 'color.accent.soft'
  | 'color.accent.line'
  | 'color.accent.ink'
>;

const palette = (v: string[]): Palette => ({
  'color.bg.app': v[0]!,
  'color.bg.glow': v[1]!,
  'color.surface.panel': v[2]!,
  'color.border.panel': v[3]!,
  'color.surface.default': v[4]!,
  'color.surface.hover': v[5]!,
  'color.border.default': v[6]!,
  'color.text.primary': v[7]!,
  'color.text.secondary': v[8]!,
  'color.text.muted': v[9]!,
  'color.scrollbar.thumb': v[10]!,
  'color.scrollbar.hover': v[11]!,
  'color.accent.primary': v[12]!,
  'color.accent.soft': v[13]!,
  'color.accent.line': v[14]!,
  'color.accent.ink': v[15]!,
});

export const schemes: Record<ThemeId, Palette> = {
  // prettier-ignore
  forest: palette(['#080b09', '#13251a', '#0d1210', '#1a221d', '#121915', '#19221c', '#212b24', '#e6ede5', '#8d9b90', '#5f6e64', '#243028', '#3a4a3e', '#afd58c', '#1e2c1b', '#405534', '#182114']),
  // prettier-ignore
  ocean: palette(['#080a0b', '#131c25', '#0d0f12', '#1a1e22', '#121519', '#191e22', '#21272b', '#e5eded', '#8d979b', '#5f686e', '#242b30', '#3a454a', '#8cc2d5', '#1b232c', '#344955', '#141b21']),
  // prettier-ignore
  lavender: palette(['#09080b', '#1b1325', '#100d12', '#1d1a22', '#151219', '#1c1922', '#24212b', '#e5e6ed', '#908d9b', '#655f6e', '#282430', '#3f3a4a', '#a78cd5', '#261b2c', '#443455', '#1b1421']),
  // prettier-ignore
  ember: palette(['#0b0908', '#251c13', '#12100d', '#221e1a', '#191612', '#221d19', '#2b2521', '#ede5e5', '#9b918d', '#6e655f', '#302924', '#4a3f3a', '#d5ae8c', '#2c281b', '#554734', '#211c14']),
  // prettier-ignore
  rose: palette(['#0b0809', '#251318', '#120d0d', '#221a1c', '#191214', '#22191c', '#2b2125', '#ede5eb', '#9b8d93', '#6e5f64', '#302428', '#4a3a41', '#d58c9e', '#2c1c1b', '#553438', '#211415']),
  // prettier-ignore
  graphite: palette(['#090a0a', '#1b1c1d', '#0f0f10', '#1e1e1e', '#151516', '#1d1e1e', '#262626', '#e9e9e9', '#939495', '#666767', '#2a2a2a', '#414243', '#cfd3d8', '#222325', '#4a4d51', '#1a1a1b']),
};

/** Light colours of popouts set to "hell" (html[data-popout-look='light'] in tokens.css). */
export const popoutLight: TokenOverrides = {
  ...palette([
    '#f2f3f6',
    '#e6ebf5',
    '#f2f3f6',
    '#e3e6eb',
    '#ffffff',
    '#f1f3f6',
    '#e3e6eb',
    '#16181d',
    '#5c6370',
    '#8b919c',
    '#d3d7de',
    '#b5bbc5',
    '#2e6af6',
    '#e9f0ff',
    '#b7ccfd',
    '#ffffff',
  ]),
  'color.status.error': '#d93a3a',
  'color.status.errorText': '#c42f2f',
  'color.tone.1': '#e8791f',
  'color.tone.2': '#12996a',
  'color.tone.3': '#7254e8',
  'color.tone.4': '#c28f00',
  'color.avatar.1': '#e2f3e8',
  'color.avatar.1Ink': '#1d7a4a',
  'color.avatar.2': '#eee8fd',
  'color.avatar.2Ink': '#5b3fc4',
  'color.avatar.3': '#e2eefb',
  'color.avatar.3Ink': '#235d9c',
  'color.avatar.0': '#eceef1',
  'color.avatar.0Ink': '#6b717c',
  'color.shadow': '#16181d29',
};

// Resolution of the final design: default → theme → colour scheme → preset → own changes →
// temporary preview; the more specific layer wins, and for every token the layer it came from is
// kept, so "why is this value like this?" always has an answer (window.__blankDesign in dev).
import type { ThemeId } from '../features/settings/themes';
import {
  presetOf,
  resolveSettings,
  type Customization,
  type DesignSettings,
  type SettingKey,
  type SettingSource,
} from './customization';
import { resolveMotion, type ResolvedMotion } from './motion';
import { schemes, themeDefs, themeTokens } from './themes';
import {
  tokenDefs,
  tokenPaths,
  type TokenOverrides,
  type TokenPath,
  type TokenValues,
} from './tokens';

export type Layer = 'default' | 'theme' | 'scheme' | 'preset' | 'user' | 'preview';

export type ResolvedDesign = {
  tokens: TokenValues;
  tokenSource: Record<TokenPath, Layer>;
  settings: DesignSettings;
  settingSource: Record<SettingKey, SettingSource>;
  motion: ResolvedMotion;
};

// --- Colour helpers for an own accent colour ---

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (c: number[]) =>
  '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
/** `amount` of `a` mixed into `b`. */
const mix = (a: string, b: string, amount: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => v * amount + y[i]! * (1 - amount)));
};
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** A colour light enough to be read as text on the dark background (mixed with white if not). */
export function readableAccent(color: string) {
  let accent = color;
  for (let white = 0.1; luminance(accent) < 0.2 && white <= 1; white += 0.1)
    accent = mix('#ffffff', color, white);
  return accent;
}

/** Accent and its companions (selected background, lines, text on the accent) from one colour. */
export function accentTokens(color: string, background: string): TokenOverrides {
  const bg = /^#[0-9a-f]{6}$/i.test(background) ? background : '#080b09';
  const accent = readableAccent(color);
  return {
    'color.accent.primary': accent,
    'color.accent.soft': mix(accent, bg, 0.14),
    'color.accent.line': mix(accent, bg, 0.36),
    'color.accent.ink': luminance(accent) > 0.35 ? mix(bg, '#000000', 0.8) : '#ffffff',
  };
}

const px = (value: string, factor: number) => {
  const n = parseFloat(value);
  return Number.isFinite(n) && value.trim().endsWith('px')
    ? `${Math.round(n * factor * 10) / 10}px`
    : value;
};

/** Spacing per density; "normal" are the theme's values. Overview pages must still fit 860 × 640. */
const densitySpace = {
  compact: { 'space.section': '8px', 'space.card': '12px', 'space.row': '6px' },
  spacious: { 'space.section': '14px', 'space.card': '17px', 'space.row': '12px' },
} as const;

export function resolveDesign(input: {
  scheme: ThemeId;
  customization: Customization;
  systemReducedMotion: boolean;
  /** Changes shown but not saved yet (e.g. while trying something in the settings). */
  preview?: TokenOverrides;
}): ResolvedDesign {
  const { customization, scheme } = input;
  const { settings, source: settingSource } = resolveSettings(customization);
  const tokens = {} as Record<TokenPath, string>;
  const tokenSource = {} as Record<TokenPath, Layer>;
  const put = (values: TokenOverrides, layer: Layer) => {
    for (const path of Object.keys(values) as TokenPath[]) {
      const value = values[path];
      if (typeof value !== 'string' || !(path in tokenDefs)) continue;
      tokens[path] = value;
      tokenSource[path] = layer;
    }
  };

  put(themeDefs.base!.tokens, 'default');
  const theme = themeTokens(customization.theme);
  const own = Object.fromEntries(
    Object.entries(theme).filter(
      ([path]) =>
        !(path in themeDefs.base!.tokens) ||
        theme[path as TokenPath] !== themeDefs.base!.tokens[path as TokenPath],
    ),
  ) as TokenOverrides;
  put(own, 'theme');
  put(schemes[scheme] ?? schemes.forest, 'scheme');
  put(presetOf(customization).tokens, 'preset');

  // Own settings that change tokens.
  const user: TokenOverrides = {};
  if (settings.accent) Object.assign(user, accentTokens(settings.accent, tokens['color.bg.app']));
  if (settings.radiusScale !== 1) {
    user['radius.scale'] = String(settings.radiusScale);
    for (const path of [
      'radius.subtle',
      'radius.small',
      'radius.control',
      'radius.card',
      'radius.large',
    ] as const)
      user[path] = px(tokens[path], settings.radiusScale);
  }
  if (settings.density !== 'normal') Object.assign(user, densitySpace[settings.density]);
  const motion = resolveMotion(settings.motionLevel, 1, input.systemReducedMotion);
  for (const name of ['fast', 'normal', 'slow', 'emphasized', 'spring'] as const)
    user[`motion.${name}`] = `${motion.durations[name]}ms`;
  user['motion.travel'] = motion.travel ? '1' : '0';
  user['motion.stagger'] = `${motion.stagger.small}ms`;
  put(user, 'user');
  // Motion values equal to the defaults are no own change.
  for (const path of [
    'motion.fast',
    'motion.normal',
    'motion.slow',
    'motion.emphasized',
    'motion.travel',
    'motion.stagger',
    'motion.spring',
  ] as const)
    if (tokens[path] === themeDefs.base!.tokens[path]) tokenSource[path] = 'default';

  if (input.preview) put(input.preview, 'preview');

  // Every token has a value (a test makes sure); should one be missing, the CSS of tokens.css
  // keeps its value instead of the app failing.
  return { tokens: tokens as TokenValues, tokenSource, settings, settingSource, motion };
}

/** Tokens without a value (should be none; used by the tests). */
export const missingTokens = (design: ResolvedDesign) =>
  tokenPaths.filter((path) => design.tokens[path] === undefined);

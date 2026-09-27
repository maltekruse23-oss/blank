// The customization of the design (stored inside the preferences, so it is saved, mirrored to
// settings.json, exported and backed up online like every other setting). Only what the user
// changed on top of the chosen preset is kept, so "changed" and resetting come for free.
// Everything read is validated: wrong types, unknown values and numbers out of range fall back to
// the default, unknown fields are ignored, older versions are migrated. See README.md.
import type { DesignThemeId } from './themes';
import type { TokenOverrides } from './tokens';

export const CUSTOMIZATION_VERSION = 1;

export type Density = 'compact' | 'normal' | 'spacious';

/** The design settings, flat; each has an entry in the registry below. */
export type DesignSettings = {
  density: Density;
  /** Animations on or off, nothing in between (user's wish: "only on or off"). */
  motionLevel: 'normal' | 'off';
  /** Own accent colour (#rrggbb), null: the colour scheme's. */
  accent: string | null;
  /** Factor on all corner radii; 0 = square corners. */
  radiusScale: number;
  /** Graphics card for effects (takes effect after a restart). */
  gpuEffects: boolean;
  blur: boolean;
  transparency: boolean;
};
export type SettingKey = keyof DesignSettings;

export type Category = 'appearance' | 'layout' | 'motion' | 'effects';

type Common = {
  category: Category;
  label: string;
  description: string;
  /** Shown only in the advanced mode of the settings. */
  advanced?: boolean;
  /** Only takes effect after blank. restarted. */
  restartRequired?: boolean;
  /** Only in effect while this setting is on (the UI shows it as inactive otherwise). */
  requires?: SettingKey;
};
type Meta =
  | (Common & { type: 'enum'; options: readonly { id: string; name: string }[]; fallback: string })
  | (Common & {
      type: 'number';
      min: number;
      max: number;
      step: number;
      fallback: number;
      unit: string;
    })
  | (Common & { type: 'boolean'; fallback: boolean })
  | (Common & { type: 'color'; fallback: null });

/** Every design setting with its limits, default and text; validation and the UI both use it. */
export const registry: Record<SettingKey, Meta> = {
  density: {
    category: 'layout',
    type: 'enum',
    label: 'Dichte',
    description: 'Wie eng Karten, Zeilen und Abstände sitzen',
    options: [
      { id: 'compact', name: 'Kompakt' },
      { id: 'normal', name: 'Normal' },
      { id: 'spacious', name: 'Luftig' },
    ],
    fallback: 'normal',
  },
  motionLevel: {
    category: 'motion',
    type: 'enum',
    label: 'Animationen',
    description: 'Bewegung der Oberfläche: Seitenwechsel, Aufklappen, Startbildschirm',
    // Earlier stored levels (Wie Windows, Reduziert, Dezent, Kräftig) are no option any more and
    // read as the default: on.
    options: [
      { id: 'normal', name: 'An' },
      { id: 'off', name: 'Aus' },
    ],
    fallback: 'normal',
  },
  accent: {
    category: 'appearance',
    type: 'color',
    label: 'Akzentfarbe',
    description: 'Eigene Farbe für Auswahl, Balken und Knöpfe statt der des Farbschemas',
    fallback: null,
  },
  radiusScale: {
    category: 'appearance',
    type: 'number',
    label: 'Rundung',
    description: '0 eckig, 1 wie gewohnt, 2 doppelt so rund',
    min: 0,
    max: 2,
    step: 0.05,
    fallback: 1,
    unit: '×',
    advanced: true,
  },
  gpuEffects: {
    category: 'effects',
    type: 'boolean',
    label: 'GPU-Effekte',
    description:
      'Nutzt die Grafikkarte für aufwendige Effekte; braucht im Hintergrund mehr Leistung',
    fallback: false,
    advanced: true,
    restartRequired: true,
  },
  blur: {
    category: 'effects',
    type: 'boolean',
    label: 'Unschärfe',
    description: 'Unscharfer Hintergrund hinter schwebenden Flächen',
    fallback: true,
  },
  transparency: {
    category: 'effects',
    type: 'boolean',
    label: 'Transparenz',
    description: 'Durchscheinende Flächen; aus: alles deckend',
    fallback: true,
  },
};

export const settingKeys = Object.keys(registry) as SettingKey[];

export const defaultSettings: DesignSettings = Object.fromEntries(
  settingKeys.map((key) => [key, registry[key].fallback]),
) as DesignSettings;

const HEX = /^#[0-9a-f]{6}$/i;

/** The value if valid for the setting (numbers clamped to its range), else undefined. */
export function validSetting<K extends SettingKey>(
  key: K,
  value: unknown,
): DesignSettings[K] | undefined {
  const meta = registry[key];
  switch (meta.type) {
    case 'enum':
      return meta.options.some((o) => o.id === value) ? (value as DesignSettings[K]) : undefined;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
      return Math.min(meta.max, Math.max(meta.min, value)) as DesignSettings[K];
    case 'boolean':
      return typeof value === 'boolean' ? (value as DesignSettings[K]) : undefined;
    case 'color':
      return value === null || (typeof value === 'string' && HEX.test(value))
        ? ((typeof value === 'string' ? value.toLowerCase() : null) as DesignSettings[K])
        : undefined;
  }
}

/** Only the valid, known settings of an object; everything else is dropped. */
export function readSettings(raw: unknown): Partial<DesignSettings> {
  if (!raw || typeof raw !== 'object') return {};
  const data = raw as Record<string, unknown>;
  const out: Partial<Record<SettingKey, unknown>> = {};
  for (const key of settingKeys) {
    const value = validSetting(key, data[key]);
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<DesignSettings>;
}

// --- Presets ---

export type PresetValues = Partial<DesignSettings>;
export type BuiltInPreset = {
  id: string;
  name: string;
  description: string;
  values: PresetValues;
  /** Token changes of the preset (on top of theme and colour scheme). */
  tokens?: TokenOverrides;
};

/** Technical starting points; design presets follow with the user later. */
export const builtInPresets: BuiltInPreset[] = [
  { id: 'default', name: 'Standard', description: 'So wie blank. gedacht ist', values: {} },
  {
    id: 'performance',
    name: 'Sparsam',
    description: 'Ohne Animationen, spart Leistung',
    values: { motionLevel: 'off', blur: false, transparency: false, gpuEffects: false },
  },
  {
    id: 'minimal',
    name: 'Schlicht',
    description: 'Flach, ohne Schatten, weniger rund',
    values: { blur: false, radiusScale: 0.5 },
    tokens: { 'shadow.raised': 'none', 'shadow.floating': 'none', 'shadow.overlay': 'none' },
  },
];

/** An own preset: its values on top of the built-in preset it was saved from (and its tokens). */
export type UserPreset = { id: string; name: string; base: string; values: PresetValues };
const MAX_USER_PRESETS = 20;
const presetId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test(v);

function readUserPresets(raw: unknown): UserPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: UserPreset[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const { id, name, base, values } = p as Record<string, unknown>;
    if (!presetId(id) || typeof name !== 'string' || out.some((o) => o.id === id)) continue;
    const clean = name
      .replace(/\p{Cc}/gu, '')
      .trim()
      .slice(0, 40);
    if (!clean) continue;
    out.push({
      id,
      name: clean,
      base: builtInPresets.some((b) => b.id === base) ? (base as string) : 'default',
      values: readSettings(values),
    });
    if (out.length === MAX_USER_PRESETS) break;
  }
  return out;
}

// --- The stored customization ---

export type Customization = {
  version: typeof CUSTOMIZATION_VERSION;
  theme: DesignThemeId;
  /** A built-in preset id or "user:" + the id of an own preset. */
  preset: string;
  /** What the user changed on top of the preset. */
  overrides: Partial<DesignSettings>;
  /** Advanced mode of the design settings (more options). */
  advanced: boolean;
  presets: UserPreset[];
};

export const defaultCustomization: Customization = {
  version: CUSTOMIZATION_VERSION,
  theme: 'classic',
  preset: 'default',
  overrides: {},
  advanced: false,
  presets: [],
};

/** Earlier settings that now live here ("Kompakte Ansicht", "Animationen"). */
export type LegacyLook = { compact?: unknown; motion?: unknown };

/**
 * Migrations: each step takes the object of one version and returns the next one. Version 0 is
 * "no customization yet": the earlier switches become overrides.
 */
const migrations: Record<
  number,
  (raw: Record<string, unknown>, legacy: LegacyLook) => Record<string, unknown>
> = {
  0: (_raw, legacy) => ({
    version: 1,
    overrides: {
      ...(legacy.compact === true ? { density: 'compact' } : {}),
      ...(legacy.motion === false ? { motionLevel: 'off' } : {}),
    },
  }),
};

/** A stored or imported customization, always usable: invalid parts fall back to the defaults. */
export function readCustomization(raw: unknown, legacy: LegacyLook = {}): Customization {
  let data: Record<string, unknown> =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  let version =
    typeof data.version === 'number' && Number.isInteger(data.version) ? data.version : 0;
  // Older versions step by step; a newer version (from a later blank.) is read as far as known.
  while (version < CUSTOMIZATION_VERSION && migrations[version]) {
    data = migrations[version]!(data, legacy);
    version += 1;
  }
  const presets = readUserPresets(data.presets);
  const preset =
    typeof data.preset === 'string' &&
    (builtInPresets.some((p) => p.id === data.preset) ||
      presets.some((p) => `user:${p.id}` === data.preset))
      ? data.preset
      : defaultCustomization.preset;
  return {
    version: CUSTOMIZATION_VERSION,
    theme: 'classic',
    preset,
    overrides: readSettings(data.overrides),
    advanced: typeof data.advanced === 'boolean' ? data.advanced : false,
    presets,
  };
}

/** The values of a preset (built-in or own); unknown: none. */
export function presetOf(c: Customization): { values: PresetValues; tokens: TokenOverrides } {
  const builtIn = builtInPresets.find((p) => p.id === c.preset);
  if (builtIn) return { values: builtIn.values, tokens: builtIn.tokens ?? {} };
  const own = c.presets.find((p) => `user:${p.id}` === c.preset);
  if (!own) return { values: {}, tokens: {} };
  const base = builtInPresets.find((p) => p.id === own.base);
  return { values: { ...base?.values, ...own.values }, tokens: base?.tokens ?? {} };
}

export type SettingSource = 'default' | 'preset' | 'user';

/** The effective settings: default → preset → own changes, and where each value comes from. */
export function resolveSettings(c: Customization): {
  settings: DesignSettings;
  source: Record<SettingKey, SettingSource>;
} {
  const preset = presetOf(c).values;
  const settings = { ...defaultSettings };
  const source = Object.fromEntries(settingKeys.map((k) => [k, 'default'])) as Record<
    SettingKey,
    SettingSource
  >;
  for (const key of settingKeys) {
    if (preset[key] !== undefined) {
      (settings as Record<SettingKey, unknown>)[key] = preset[key];
      source[key] = 'preset';
    }
    if (c.overrides[key] !== undefined) {
      (settings as Record<SettingKey, unknown>)[key] = c.overrides[key];
      source[key] = 'user';
    }
  }
  return { settings, source };
}

/** Sets own values (validated); a value equal to the preset's removes the own change. */
export function changeSettings(c: Customization, patch: Partial<DesignSettings>): Customization {
  const preset = presetOf(c).values;
  const overrides: Partial<Record<SettingKey, unknown>> = { ...c.overrides };
  for (const key of Object.keys(patch) as SettingKey[]) {
    const value = validSetting(key, patch[key]);
    if (value === undefined) continue;
    const base = preset[key] ?? defaultSettings[key];
    if (value === base) delete overrides[key];
    else overrides[key] = value;
  }
  return { ...c, overrides: overrides as Partial<DesignSettings> };
}

/** Back to the preset: single settings, a whole category, or everything. */
export function resetSettings(
  c: Customization,
  which: SettingKey[] | Category | 'all',
): Customization {
  const keys =
    which === 'all'
      ? settingKeys
      : typeof which === 'string'
        ? settingKeys.filter((k) => registry[k].category === which)
        : which;
  const overrides: Partial<Record<SettingKey, unknown>> = { ...c.overrides };
  for (const key of keys) delete overrides[key];
  return { ...c, overrides: overrides as Partial<DesignSettings> };
}

// --- Choosing, saving and deleting presets ---

/** Chooses a preset; own changes to what the preset sets give way, so it shows, the rest stays. */
export function choosePreset(c: Customization, preset: string): Customization {
  const known =
    builtInPresets.some((p) => p.id === preset) || c.presets.some((p) => `user:${p.id}` === preset);
  if (!known) return c;
  const next = { ...c, preset };
  const values = presetOf(next).values;
  const overrides: Partial<Record<SettingKey, unknown>> = { ...c.overrides };
  for (const key of Object.keys(values) as SettingKey[]) delete overrides[key];
  return { ...next, overrides: overrides as Partial<DesignSettings> };
}

/** The effective values that differ from the defaults (what an own preset needs to store). */
function ownValues(c: Customization): PresetValues {
  const { settings } = resolveSettings(c);
  const out: Partial<Record<SettingKey, unknown>> = {};
  for (const key of settingKeys)
    if (settings[key] !== defaultSettings[key]) out[key] = settings[key];
  return out as PresetValues;
}

/** Saves the current look as an own preset and chooses it; null if the name is empty or 20 exist. */
export function savePreset(c: Customization, name: string): Customization | null {
  const clean = name
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, 40);
  if (!clean || c.presets.length >= MAX_USER_PRESETS) return null;
  const slug =
    clean
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'eigenes';
  let id = slug;
  for (let n = 2; c.presets.some((p) => p.id === id); n++) id = `${slug}-${n}`;
  const current = c.presets.find((p) => `user:${p.id}` === c.preset);
  const base =
    current?.base ?? (builtInPresets.some((p) => p.id === c.preset) ? c.preset : 'default');
  const preset: UserPreset = { id, name: clean, base, values: ownValues(c) };
  return { ...c, presets: [...c.presets, preset], preset: `user:${id}`, overrides: {} };
}

/** Deletes an own preset; if it was chosen, its look stays as own changes on "Standard". */
export function deletePreset(c: Customization, id: string): Customization {
  const presets = c.presets.filter((p) => p.id !== id);
  if (c.preset !== `user:${id}`) return { ...c, presets };
  // Tokens of the preset's base (e.g. "Schlicht" without shadows) are no settings; they go with it.
  return { ...c, presets, preset: 'default', overrides: ownValues(c) };
}

/** How many settings the user changed on top of the preset. */
export const changedCount = (c: Customization) => Object.keys(c.overrides).length;

// --- Export and import (a deliberate public format, not the internal state) ---

const EXPORT_KIND = 'blank.design';

export function exportCustomization(c: Customization): string {
  return JSON.stringify(
    {
      kind: EXPORT_KIND,
      version: CUSTOMIZATION_VERSION,
      theme: c.theme,
      preset: c.preset,
      overrides: c.overrides,
      presets: c.presets,
    },
    null,
    2,
  );
}

/** The customization of an exported text, or the reason it cannot be used. */
export function importCustomization(text: string): Customization | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'Keine gültige Datei.' };
  }
  if (!data || typeof data !== 'object' || (data as Record<string, unknown>).kind !== EXPORT_KIND)
    return { error: 'Das ist kein Design von blank.' };
  return readCustomization(data);
}

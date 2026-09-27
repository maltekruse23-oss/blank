import { describe, expect, it } from 'vitest';
import tokensCss from '../styles/tokens.css?raw';
import { readPreferences, withDesign } from '../features/settings/preferences';
import { themes, type ThemeId } from '../features/settings/themes';
import {
  changedCount,
  changeSettings,
  choosePreset,
  deletePreset,
  defaultCustomization,
  exportCustomization,
  importCustomization,
  readCustomization,
  resetSettings,
  resolveSettings,
  savePreset,
  type Customization,
} from './customization';
import { resolveMotion } from './motion';
import { missingTokens, readableAccent, resolveDesign } from './resolve';
import { popoutLight, themeTokens } from './themes';
import { tokenDefs, tokenPaths, type TokenPath } from './tokens';

const design = (customization: Customization = defaultCustomization, scheme: ThemeId = 'forest') =>
  resolveDesign({ scheme, customization, systemReducedMotion: false });

/** The custom properties of each rule of tokens.css, by selector. */
function cssBlocks() {
  const blocks = new Map<string, Record<string, string>>();
  const text = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const values: Record<string, string> = {};
    for (const d of match[2]!.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g))
      values[d[1]!] = d[2]!.trim();
    for (const selector of match[1]!.split(',').map((s) => s.trim()))
      blocks.set(selector, { ...blocks.get(selector), ...values });
  }
  return blocks;
}
const cssOf = (path: TokenPath) => tokenDefs[path].css;

describe('Tokens', () => {
  it('haben in jedem Farbschema einen Wert', () => {
    for (const t of themes) expect(missingTokens(design(defaultCustomization, t.id))).toEqual([]);
  });

  it('stimmen mit tokens.css überein (erster Bildaufbau vor dem Start der App)', () => {
    const blocks = cssBlocks();
    const root = blocks.get(':root');
    expect(root).toBeDefined();
    let compared = 0;
    for (const t of themes) {
      const css = { ...root, ...blocks.get(`[data-theme='${t.id}']`) };
      const resolved = design(defaultCustomization, t.id).tokens;
      for (const path of tokenPaths) {
        const inCss = css[cssOf(path)];
        // Only properties tokens.css defines (the new scales exist only in the design system).
        if (inCss === undefined) continue;
        expect([t.id, path, resolved[path]]).toEqual([t.id, path, inCss]);
        compared += 1;
      }
    }
    // Never pass by comparing nothing (e.g. if the CSS could not be read).
    expect(compared).toBeGreaterThan(6 * 30);
  });

  it('helle Popout-Farben stimmen mit tokens.css überein', () => {
    const light = cssBlocks().get("html[data-popout-look='light']")!;
    for (const [path, value] of Object.entries(popoutLight))
      expect([path, value]).toEqual([path, light[cssOf(path as TokenPath)]]);
  });

  it('Vererbung: Klassisch hat Basis und Dunkel, eine Schleife hängt nicht', () => {
    const t = themeTokens('classic');
    expect(t['radius.large']).toBe('16px');
    expect(t['color.shadow']).toBe('#000a');
    expect(themeTokens('gibt-es-nicht')).toEqual({});
  });
});

describe('Konfiguration lesen', () => {
  it('fehlt sie, werden die früheren Schalter übernommen', () => {
    const c = readCustomization(undefined, { compact: true, motion: false });
    expect(c.overrides).toEqual({ density: 'compact', motionLevel: 'off' });
    expect(readCustomization(undefined, { compact: false, motion: true }).overrides).toEqual({});
  });

  it('ist sie da, zählen die früheren Schalter nicht mehr (eine Quelle)', () => {
    const c = readCustomization({ version: 1, overrides: {} }, { compact: true, motion: false });
    expect(c.overrides).toEqual({});
  });

  it('ungültige Werte fallen weg, Zahlen werden begrenzt', () => {
    const c = readCustomization({
      version: 1,
      overrides: {
        density: 'riesig',
        motionSpeed: 2,
        radiusScale: 99,
        accent: 'rot',
        blur: 'ja',
        gpuEffects: true,
        unbekannt: 5,
      },
    });
    expect(c.overrides).toEqual({ radiusScale: 2, gpuEffects: true });
    expect(
      readCustomization({ version: 1, overrides: { accent: '#AABBCC' } }).overrides.accent,
    ).toBe('#aabbcc');
    expect(readCustomization({ version: 1, overrides: { radiusScale: NaN } }).overrides).toEqual(
      {},
    );
  });

  it('kaputte Eingaben ergeben die Standardwerte', () => {
    for (const raw of [null, [], 'text', 42, { version: 'x', overrides: 'x', presets: 'x' }])
      expect(readCustomization(raw)).toEqual(defaultCustomization);
  });

  it('eine neuere Version wird gelesen, soweit bekannt', () => {
    const c = readCustomization({
      version: 7,
      preset: 'minimal',
      overrides: { density: 'spacious' },
      neu: {},
    });
    expect(c.preset).toBe('minimal');
    expect(c.overrides.density).toBe('spacious');
  });

  it('eigene Presets werden geprüft', () => {
    const c = readCustomization({
      version: 1,
      preset: 'user:mein',
      presets: [
        { id: 'mein', name: '  Mein Look  ', values: { density: 'compact', radiusScale: 5 } },
        { id: 'mein', name: 'doppelt', values: {} },
        { id: 'Böse ID', name: 'x', values: {} },
        { id: 'leer', name: '   ', values: {} },
        ...Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, values: {} })),
      ],
    });
    expect(c.presets[0]).toEqual({
      id: 'mein',
      name: 'Mein Look',
      base: 'default',
      values: { density: 'compact', radiusScale: 2 },
    });
    expect(c.presets).toHaveLength(20);
    expect(c.preset).toBe('user:mein');
    expect(readCustomization({ version: 1, preset: 'user:fehlt' }).preset).toBe('default');
  });
});

describe('Auflösung', () => {
  it('Standard → Preset → eigene Änderung, mit Quelle', () => {
    let c: Customization = { ...defaultCustomization, preset: 'performance' };
    c = changeSettings(c, { density: 'compact' });
    const { settings, source } = resolveSettings(c);
    expect(settings.motionLevel).toBe('off');
    expect(source.motionLevel).toBe('preset');
    expect(settings.density).toBe('compact');
    expect(source.density).toBe('user');
    expect(source.radiusScale).toBe('default');
  });

  it('ein Wert gleich dem Preset ist keine eigene Änderung; Zurücksetzen je Kategorie', () => {
    let c = changeSettings(defaultCustomization, {
      density: 'spacious',
      motionLevel: 'off',
      blur: false,
    });
    expect(Object.keys(c.overrides).sort()).toEqual(['blur', 'density', 'motionLevel']);
    c = changeSettings(c, { density: 'normal' });
    expect(c.overrides.density).toBeUndefined();
    expect(resetSettings(c, 'motion').overrides).toEqual({ blur: false });
    expect(resetSettings(c, 'all').overrides).toEqual({});
    expect(
      changeSettings(c, { motionLevel: 'schnell' as unknown as 'off' }).overrides.motionLevel,
    ).toBe('off');
  });

  it('Schichten der Tokens mit Quelle; Vorschau gewinnt', () => {
    const base = design();
    expect(base.tokenSource['radius.large']).toBe('default');
    expect(base.tokenSource['color.shadow']).toBe('theme');
    expect(base.tokenSource['color.accent.primary']).toBe('scheme');
    const minimal = design({ ...defaultCustomization, preset: 'minimal' });
    expect(minimal.tokens['shadow.raised']).toBe('none');
    expect(minimal.tokenSource['shadow.raised']).toBe('preset');
    const own = design(
      changeSettings(defaultCustomization, {
        accent: '#ff8800',
        radiusScale: 0,
        density: 'spacious',
      }),
    );
    expect(own.tokens['color.accent.primary']).toBe('#ff8800');
    expect(own.tokenSource['color.accent.soft']).toBe('user');
    expect(own.tokens['color.accent.ink']).toMatch(/^#[0-9a-f]{6}$/);
    expect(own.tokens['radius.card']).toBe('0px');
    expect(own.tokens['radius.round']).toBe('999px');
    expect(own.tokens['space.section']).toBe('14px');
    const preview = resolveDesign({
      scheme: 'forest',
      customization: defaultCustomization,
      systemReducedMotion: false,
      preview: { 'color.accent.primary': '#123456' },
    });
    expect(preview.tokens['color.accent.primary']).toBe('#123456');
    expect(preview.tokenSource['color.accent.primary']).toBe('preview');
  });

  it('ohne eigene Änderungen gleicht alles den Standardwerten (keine sichtbare Änderung)', () => {
    const d = design();
    expect(d.tokens['space.section']).toBe('12px');
    expect(d.tokens['motion.normal']).toBe('200ms');
    expect(Object.values(d.tokenSource).includes('user')).toBe(false);
  });
});

describe('Wirkung der Einstellungen', () => {
  it('Dichte setzt Abstände zwischen, in Karten und in Zeilen', () => {
    const at = (density: 'compact' | 'normal' | 'spacious') =>
      design(changeSettings(defaultCustomization, { density })).tokens;
    expect([
      at('normal')['space.section'],
      at('normal')['space.card'],
      at('normal')['space.row'],
    ]).toEqual(['12px', '16px', '9px']);
    expect([
      at('compact')['space.section'],
      at('compact')['space.card'],
      at('compact')['space.row'],
    ]).toEqual(['8px', '12px', '6px']);
    expect([
      at('spacious')['space.section'],
      at('spacious')['space.card'],
      at('spacious')['space.row'],
    ]).toEqual(['14px', '17px', '12px']);
  });

  it('Rundung wirkt auf benannte Radien und den Faktor für das übrige CSS', () => {
    const d = design(changeSettings(defaultCustomization, { radiusScale: 0.5 }));
    expect(d.tokens['radius.scale']).toBe('0.5');
    expect(d.tokens['radius.card']).toBe('6px');
    expect(design().tokens['radius.scale']).toBe('1');
  });

  it('Animationen nur an oder aus; frühere Stufen gelten als an', () => {
    expect(design().tokens['motion.normal']).toBe('200ms');
    for (const level of ['enhanced', 'reduced', 'subtle', 'system'])
      expect(
        resolveSettings(readCustomization({ version: 1, overrides: { motionLevel: level } }))
          .settings.motionLevel,
      ).toBe('normal');
    // "An" also when Windows' animation effects are off (user's wish: on means on).
    expect(
      resolveDesign({
        scheme: 'forest',
        customization: defaultCustomization,
        systemReducedMotion: true,
      }).motion.travel,
    ).toBe(true);
    const off = design(changeSettings(defaultCustomization, { motionLevel: 'off' }));
    expect([off.tokens['motion.normal'], off.tokens['motion.travel']]).toEqual(['0ms', '0']);
    expect(design().tokenSource['motion.travel']).toBe('default');
  });

  it('eine zu dunkle eigene Akzentfarbe wird lesbar aufgehellt', () => {
    for (const color of ['#000000', '#101820', '#3a0000']) {
      const accent = readableAccent(color);
      expect(accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(accent).not.toBe(color);
    }
    expect(readableAccent('#7cb8f5')).toBe('#7cb8f5');
    const d = design(changeSettings(defaultCustomization, { accent: '#000000' }));
    expect(d.tokens['color.accent.primary']).not.toBe('#000000');
  });
});

describe('Stile (Presets)', () => {
  it('Wählen: eigene Änderungen am Stil weichen, andere bleiben', () => {
    let c = changeSettings(defaultCustomization, { radiusScale: 1.5, density: 'compact' });
    c = choosePreset(c, 'minimal');
    expect(c.preset).toBe('minimal');
    expect(c.overrides).toEqual({ density: 'compact' });
    expect(resolveSettings(c).settings.radiusScale).toBe(0.5);
    expect(choosePreset(c, 'gibt-es-nicht')).toBe(c);
  });

  it('Speichern und Löschen ändern das Aussehen nicht', () => {
    let c = choosePreset(defaultCustomization, 'minimal');
    c = changeSettings(c, { accent: '#7cb8f5', density: 'spacious' });
    const before = design(c).tokens;
    const saved = savePreset(c, '  Mein Stil  ')!;
    expect(saved.preset).toBe('user:mein-stil');
    expect(saved.overrides).toEqual({});
    expect(changedCount(saved)).toBe(0);
    expect(saved.presets[0]!.base).toBe('minimal');
    // Same look, including the tokens of the style it came from (no shadows).
    expect(design(saved).tokens).toEqual(before);
    const deleted = deletePreset(saved, 'mein-stil');
    expect(deleted.presets).toEqual([]);
    expect(deleted.preset).toBe('default');
    expect(resolveSettings(deleted).settings).toEqual(resolveSettings(saved).settings);
  });

  it('Namen: Umlaute, doppelte, leere, höchstens 20', () => {
    let c = savePreset(defaultCustomization, 'Grün & Ruhig')!;
    expect(c.presets[0]!.id).toBe('grun-ruhig');
    c = savePreset(c, 'Grün & Ruhig')!;
    expect(c.presets[1]!.id).toBe('grun-ruhig-2');
    expect(savePreset(c, '   ')).toBeNull();
    for (let i = 0; i < 18; i++) c = savePreset(c, `S${i}`)!;
    expect(c.presets).toHaveLength(20);
    expect(savePreset(c, 'noch einer')).toBeNull();
    // Stored and read again: the same.
    expect(readCustomization(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });
});

describe('Bewegung', () => {
  it('Stufen und Tempo', () => {
    const normal = resolveMotion('normal', 1, false);
    expect(normal.durations.normal).toBe(200);
    expect(resolveMotion('normal', 2, false).durations.normal).toBe(100);
    const off = resolveMotion('off', 1, false);
    expect(off.enabled).toBe(false);
    expect(off.durations.slow).toBe(0);
    const system = resolveMotion('system', 1, true);
    expect(system.level).toBe('reduced');
    expect(system.travel).toBe(false);
    expect(resolveMotion('system', 1, false).level).toBe('normal');
    expect(resolveMotion('enhanced', 1, false).springs.default.stiffness).toBeGreaterThan(
      normal.springs.default.stiffness,
    );
  });
});

describe('Export und Import', () => {
  it('Hin und zurück gleich; fremde oder kaputte Dateien werden abgelehnt', () => {
    const c = changeSettings(
      {
        ...defaultCustomization,
        preset: 'minimal',
        presets: [{ id: 'a', name: 'A', base: 'minimal', values: { blur: false } }],
      },
      { accent: '#00aaff' },
    );
    const back = importCustomization(exportCustomization(c));
    expect(back).toEqual({ ...c, advanced: false });
    expect(importCustomization('{kaputt')).toEqual({ error: 'Keine gültige Datei.' });
    expect(importCustomization('{"kind":"etwas"}')).toEqual({
      error: 'Das ist kein Design von blank.',
    });
  });
});

describe('Einstellungen der App', () => {
  it('alte Einstellungen: Kompakt und Animationen aus werden übernommen und bleiben gleich', () => {
    const p = readPreferences({ compact: true, motion: false, theme: 'ocean' })!;
    expect(p.compact).toBe(true);
    expect(p.motion).toBe(false);
    expect(p.customization.overrides).toEqual({ density: 'compact', motionLevel: 'off' });
    // Stored again and read back: the same.
    expect(readPreferences(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('Umschalten über withDesign hält die abgeleiteten Schalter richtig', () => {
    const p = readPreferences({ compact: false, motion: true })!;
    const q = withDesign(p, (c) => changeSettings(c, { density: 'compact', motionLevel: 'off' }));
    expect([q.compact, q.motion]).toEqual([true, false]);
    const r = withDesign(q, (c) => resetSettings(c, 'all'));
    expect([r.compact, r.motion]).toEqual([false, true]);
  });
});

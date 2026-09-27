// Brings the resolved design into the app window: tokens as CSS custom properties on <html>
// (a colour change restyles by CSS, nothing re-renders), motion for TypeScript animations via
// useMotion(). The popout window keeps its own look (src/features/popouts/) for now.
import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import type { Preferences } from '../features/settings/preferences';
import { getMotion, setMotion, subscribeMotion } from './motion';
import { resolveDesign, type ResolvedDesign } from './resolve';
import { tokenDefs, tokenPaths, type TokenOverrides } from './tokens';

// Windows' animation effects ("reduce motion"), followed by its change event, never polled.
const reducedQuery = () => window.matchMedia('(prefers-reduced-motion: reduce)');
const systemReduced = () => reducedQuery().matches;
function subscribeReduced(listener: () => void) {
  const query = reducedQuery();
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** Writes the tokens to the root element; only changed values touch the DOM. */
export function applyTokens(design: ResolvedDesign, root: HTMLElement = document.documentElement) {
  for (const path of tokenPaths) {
    const value = design.tokens[path];
    if (value === undefined) continue;
    const name = tokenDefs[path].css;
    if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
  }
  root.dataset.density = design.settings.density;
  // The motion level for the CSS (off: nothing moves; replaces the reduced-motion media query).
  root.dataset.motion = design.motion.level;
}

/** The app's design from its preferences, applied before the next paint. */
export function useDesign(preferences: Preferences, preview?: TokenOverrides): ResolvedDesign {
  const reduced = useSyncExternalStore(subscribeReduced, systemReduced);
  const design = useMemo(
    () =>
      resolveDesign({
        scheme: preferences.theme,
        customization: preferences.customization,
        systemReducedMotion: reduced,
        preview,
      }),
    [preferences.theme, preferences.customization, preview, reduced],
  );
  useLayoutEffect(() => {
    applyTokens(design);
    setMotion(design.motion);
    // For development only: where every value comes from.
    if (import.meta.env.DEV)
      (window as unknown as { __blankDesign: ResolvedDesign }).__blankDesign = design;
  }, [design]);
  return design;
}

/** The current motion (durations, springs, staggers) for animations in TypeScript. */
export const useMotion = () => useSyncExternalStore(subscribeMotion, getMotion);

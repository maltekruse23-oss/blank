// The Mayhem app's windows (src-tauri/src/mayhem.rs, mayhem.html, vite.mayhem.config.ts): the
// dashboard in the look "Arena" (MAYHEM-DESIGN.md): Home, Champ-Karte, tier lists, rank; and the
// overlay over the game (overlay.rs), each loading only its own code. Nothing of blank. English
// only (user's choice 08.10.2026), blank. stays German.
import { isTauri } from '@tauri-apps/api/core';
import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { isOverlayWindow } from '../adapters/overlay';
import { Guard } from '../components/Guard';
import { listenForErrors } from '../platform/errorLog';
import './mayhem.css';

const overlay = isOverlayWindow();
const Page = overlay
  ? lazy(() => import('./OverlayView').then((m) => ({ default: m.OverlayView })))
  : lazy(() => import('./MayhemApp').then((m) => ({ default: m.MayhemApp })));
// Transparent over the game; the preview keeps the app's background to be seen at all.
if (overlay && isTauri()) document.documentElement.classList.add('mayhem-overlay-window');

listenForErrors(overlay ? 'Mayhem overlay' : 'Mayhem');
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Guard
      name={overlay ? 'Overlay' : 'Mayhem'}
      // Over the game a broken overlay disappears instead of covering it.
      fallback={(retry) =>
        overlay ? null : (
          <div className="mayhem-wait">
            <p>Something went wrong.</p>
            <button type="button" className="mayhem-button" onClick={retry}>
              Reload
            </button>
          </div>
        )
      }
    >
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    </Guard>
  </React.StrictMode>,
);

// The Mayhem app's own slim bar on top (user, 08.10.2026: the Windows title bar "sieht nicht
// modern aus"): the window is frameless (tauri.mayhem.conf.json), the bar drags it (a double click
// maximizes, like Windows) and holds minimize, maximize/restore and close. Close really quits, as
// before. The browser preview has no window: there only the empty bar.
import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import {
  closeWindow,
  hasNativeWindow,
  minimizeWindow,
  toggleMaximizeWindow,
  watchMaximized,
} from '../platform/window';

export function WindowBar() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => watchMaximized(setMaximized), []);
  return (
    <header className="mayhem-windowbar" data-tauri-drag-region>
      {hasNativeWindow && (
        <div className="mayhem-window-buttons">
          <button type="button" aria-label="Minimize" title="Minimize" onClick={minimizeWindow}>
            <Minus size={16} strokeWidth={1.8} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={maximized ? 'Restore' : 'Maximize'}
            title={maximized ? 'Restore' : 'Maximize'}
            onClick={toggleMaximizeWindow}
          >
            {maximized ? (
              <Copy size={13} strokeWidth={1.8} aria-hidden />
            ) : (
              <Square size={13} strokeWidth={1.8} aria-hidden />
            )}
          </button>
          <button
            type="button"
            className="close"
            aria-label="Close"
            title="Close"
            onClick={closeWindow}
          >
            <X size={17} strokeWidth={1.8} aria-hidden />
          </button>
        </div>
      )}
    </header>
  );
}

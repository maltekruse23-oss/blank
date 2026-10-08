// The Mayhem app's window (src-tauri/src/mayhem.rs, mayhem.html, vite.mayhem.config.ts): only the
// dashboard in the look "Arena" (MAYHEM-DESIGN.md): Home, Champ-Karte, tier lists, rank; nothing of
// blank. English only (user's choice 08.10.2026), blank. stays German.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Guard } from '../components/Guard';
import { listenForErrors } from '../platform/errorLog';
import { MayhemApp } from './MayhemApp';
import './mayhem.css';

listenForErrors('Mayhem');
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Guard
      name="Mayhem"
      fallback={(retry) => (
        <div className="mayhem-wait">
          <p>Something went wrong.</p>
          <button type="button" className="mayhem-button" onClick={retry}>
            Reload
          </button>
        </div>
      )}
    >
      <MayhemApp />
    </Guard>
  </React.StrictMode>,
);

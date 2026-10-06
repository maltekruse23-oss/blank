// The Mayhem app's window (src-tauri/src/mayhem.rs, mayhem.html, vite.mayhem.config.ts): only the
// Champ-Karte, in the website's look "Augment-Wahl" (MAYHEM-DESIGN.md), nothing of blank.
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
          <p>Da ist etwas schiefgegangen.</p>
          <button type="button" className="mayhem-button" onClick={retry}>
            Neu laden
          </button>
        </div>
      )}
    >
      <MayhemApp />
    </Guard>
  </React.StrictMode>,
);

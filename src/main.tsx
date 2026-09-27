import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import { PopoutWindow } from './features/popouts/PopoutWindow';
import { isPopoutWindow } from './platform/popout';
import { restoreSettings } from './platform/store';
import './styles/tokens.css';
import './styles/app.css';
import './styles/desktop.css';
import './styles/popouts.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);
if (isPopoutWindow()) {
  // A popout only reads the settings; the app window keeps them complete.
  root.render(
    <React.StrictMode>
      <PopoutWindow />
    </React.StrictMode>,
  );
} else {
  // The saved settings must be complete before the app reads them on its first render.
  void restoreSettings().finally(() =>
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    ),
  );
}

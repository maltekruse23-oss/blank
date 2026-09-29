import React, { type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { CrashScreen } from './app/CrashScreen';
import { Guard } from './components/Guard';
import { listenForErrors, logError } from './platform/errorLog';
import { isPopoutWindow } from './platform/popout';
import './styles/tokens.css';
import './styles/app.css';
import './styles/desktop.css';
import './styles/popouts.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);
const show = (content: ReactNode) => root.render(<React.StrictMode>{content}</React.StrictMode>);

// Each window loads only its own part: a popout window never loads the pages of the app.
if (isPopoutWindow()) {
  listenForErrors('Popout');
  // A popout only reads the settings; the app window keeps them complete.
  void import('./features/popouts/PopoutWindow').then(
    ({ PopoutWindow, PopoutCrashed }) =>
      show(
        <Guard name="Popout" fallback={() => <PopoutCrashed />}>
          <PopoutWindow />
        </Guard>,
      ),
    (error: unknown) => logError('Popout', error),
  );
} else {
  listenForErrors('App');
  // The saved settings must be complete before the app reads them on its first render (a failed
  // restore still opens the app, as before).
  void Promise.all([
    import('./app/App'),
    import('./platform/store').then(({ restoreSettings }) => restoreSettings().catch(() => {})),
  ]).then(
    ([{ App }]) =>
      show(
        <Guard name="App" fallback={() => <CrashScreen />}>
          <App />
        </Guard>,
      ),
    (error: unknown) => {
      logError('App', error);
      show(<CrashScreen />);
    },
  );
}

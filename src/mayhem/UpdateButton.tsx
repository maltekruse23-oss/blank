import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { version } from '../../package.json';
import notes from '../../.github/release-notes.md?raw';
import { inline, MAYHEM_NEWS, newsItems } from '../app/releaseNotes';
import { useUpdate } from '../app/useUpdate';
import { mayhemMoved, updateNews } from '../platform/system';
import { More, Overlay } from './ui';
import { updateView } from './updateView';

/**
 * "Update" in the sidebar (user 08.10.2026: "Patch-Button, der direkt die neueste Version holt,
 * mit Patchnotes"): the same verified flow as blank. (update.rs, for mayhem.exe). A click asks
 * GitHub and shows the new version's English notes; only "Install and restart" installs. The
 * check after the start (useUpdate) only puts a dot on the button. After an update the app says
 * once what is new, built in from the release text (no internet, no stored data).
 */
export function UpdateButton() {
  const updates = useUpdate(true);
  const [open, setOpen] = useState(false);
  const [news, setNews] = useState(false);
  /** blank.'s update made this app (from_blank.rs): what was cleaned up, shown with the news. */
  const [moved, setMoved] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Both answers before the dialog: the cleanup in Rust can take seconds, and its line must not
    // come after "Got it". It can also come without an update (a later try). A second call (dev
    // double effect) gets false and null.
    void Promise.all([updateNews?.().catch(() => false), mayhemMoved?.().catch(() => null)]).then(
      ([updated, line]) => {
        if (line) setMoved(line);
        if (updated || line) setNews(true);
      },
    );
  }, []);

  const show = () => {
    setOpen(true);
    const { status } = updates.state;
    if (status !== 'checking' && status !== 'installing') void updates.check();
  };
  const close = () => {
    setOpen(false);
    setNews(false);
    button.current?.focus();
  };

  const { state, available } = updates;
  const view = updateView(state, navigator.onLine);
  const fresh = newsItems(notes, MAYHEM_NEWS);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="mayhem-update"
        data-new={!!available}
        aria-haspopup="dialog"
        aria-label={
          available ? `Update available, version ${available}` : 'Update, check for a new version'
        }
        title={available ? `Version ${available} is available` : 'Check for a new version'}
        onClick={show}
      >
        <Download size={20} strokeWidth={1.9} aria-hidden />
        <span>Update</span>
      </button>
      {open ? (
        <Dialog title={view.title} onClose={close}>
          {view.text && <p aria-live="polite">{view.text}</p>}
          {view.percent !== null && (
            <div
              className="mayhem-progress"
              role="progressbar"
              aria-label="Download"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={view.percent}
            >
              <span style={{ width: `${view.percent}%` }} />
            </div>
          )}
          {state.status === 'ready' && state.info.available && <Notes items={state.info.notes} />}
          <div className="mayhem-dialog-actions">
            {view.action === 'install' && (
              <button
                type="button"
                className="mayhem-button primary"
                autoFocus
                onClick={() => void updates.install()}
              >
                Install and restart
              </button>
            )}
            {view.action === 'retry' && (
              <button
                type="button"
                className="mayhem-button primary"
                autoFocus
                onClick={() => void updates.check()}
              >
                Try again
              </button>
            )}
            <button
              type="button"
              className="mayhem-button"
              autoFocus={!view.action}
              onClick={close}
            >
              {view.action === 'install' ? 'Later' : 'Close'}
            </button>
          </div>
        </Dialog>
      ) : (
        news &&
        (moved || fresh.length > 0) && (
          <Dialog
            title={moved ? 'blank. is now the Mayhem app' : `What's new in ${version}`}
            onClose={close}
          >
            {moved && <p>{moved}</p>}
            {fresh.length > 0 && <Notes items={fresh} />}
            <div className="mayhem-dialog-actions">
              <button type="button" className="mayhem-button primary" autoFocus onClick={close}>
                Got it
              </button>
            </div>
          </Dialog>
        )
      )}
    </>
  );
}

/** The notes as plain text (bold and code only as elements), the first five, then "Show more". */
function Notes({ items }: { items: string[] }) {
  if (!items.length) return <p className="mayhem-note">No notes for this version.</p>;
  return (
    <div className="mayhem-notes">
      <More list={items} className="" render={(item, i) => <li key={i}>{inline(item)}</li>} />
    </div>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Overlay onClose={onClose}>
      <div
        className="mayhem-glow mayhem-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mayhem-dialog-title"
      >
        <h2 id="mayhem-dialog-title">{title}</h2>
        {children}
      </div>
    </Overlay>
  );
}

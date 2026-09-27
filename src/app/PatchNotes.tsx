import { useEffect, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { spring } from '../design/motion';
import { version } from '../../package.json';
import notes from '../../.github/release-notes.md?raw';

/**
 * What is new in this version: the section "Neu in dieser Version" of the release text
 * (.github/release-notes.md, built into the app, so it matches the installed version and needs no
 * internet). Shown once after an update (update.rs) and from Settings → System → Neuigkeiten.
 */
export const newsItems = (text: string) => {
  const start = text.indexOf('## Neu in dieser Version');
  if (start < 0) return [];
  const rest = text.slice(start).split('\n').slice(1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end))
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
};

/** **bold** and `code` of the release text as elements (no HTML from the text). */
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .map((part, i) =>
      part.startsWith('**') ? (
        <b key={i}>{part.slice(2, -2)}</b>
      ) : part.startsWith('`') ? (
        <code key={i}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

export function PatchNotes({ onClose }: { onClose: () => void }) {
  const items = newsItems(notes);
  useEffect(() => {
    const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <motion.div
      className="restore-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="news-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, transition: { duration: 0.16 } }}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.div
        className="restore-card patch-notes"
        initial={{ opacity: 0, y: 18, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: spring('bouncy') }}
        exit={{ opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.14 } }}
      >
        <span className="page-icon">
          <Sparkles size={17} />
        </span>
        <h2 id="news-title">Neu in Version {version}</h2>
        <ul>
          {items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>
        <button className="primary-button" onClick={onClose} autoFocus>
          Alles klar
        </button>
      </motion.div>
    </motion.div>
  );
}

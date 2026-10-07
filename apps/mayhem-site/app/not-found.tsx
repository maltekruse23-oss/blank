'use client';
import { Problem } from './ui/bits';
import { useLang } from './ui/i18n';

// Any unknown address: the same card as a missing player or game, in the address's language, with
// the way back.
export default function NotFound() {
  const { t } = useLang();
  return <Problem message={t('Page not found', 'Seite nicht gefunden')} missing />;
}

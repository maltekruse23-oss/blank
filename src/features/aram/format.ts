// Numbers and times of the ARAM page, German style; 'en' for the Mayhem app (English only).
export type Lang = 'de' | 'en';
export const number = (value: number, lang: Lang = 'de') =>
  Math.round(value).toLocaleString(lang === 'en' ? 'en-US' : 'de-DE');
export const percent = (share: number, lang: Lang = 'de') =>
  `${Math.round(share * 100)}${lang === 'en' ? '' : ' '}%`;
export const decimal = (value: number) =>
  value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export const day = (ms: number) =>
  new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

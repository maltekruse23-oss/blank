// Numbers and times of the ARAM page, German style.
export const number = (value: number) => Math.round(value).toLocaleString('de-DE');
export const percent = (share: number) => `${Math.round(share * 100)} %`;
export const decimal = (value: number) =>
  value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export const day = (ms: number) =>
  new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

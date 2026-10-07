// The API guide (/api-guide, /de/api-guide). Sections in api-guide.json, each with the German
// title/text and titleEn/textEn; the examples are the same in both languages.
import { text, type Lang } from '../ui/lang';
import sections from './api-guide.json';

export default function Guide({ lang }: { lang: Lang }) {
  const t = text(lang);
  return (
    <article className="prose">
      <h1>{t('Connect an app.', 'App verbinden.')}</h1>
      <p>
        {t('Fixed base address: ', 'Feste Basisadresse: ')}
        <code>https://mayhemstats.lol/api</code>
      </p>
      <p>
        <a href="/example-game-upload.json" download>
          {t('Download an example upload.json (made-up test values)', 'Beispiel für upload.json herunterladen (fiktive Testwerte)')}
        </a>
      </p>
      {sections.map((s) => (
        <section key={s.title}>
          <h2>{t(s.titleEn, s.title)}</h2>
          <p>{t(s.textEn, s.text)}</p>
          {s.request && <pre>{s.request}</pre>}
          {s.response && (
            <>
              <p>{t('Example response:', 'Beispielantwort:')}</p>
              <pre>{typeof s.response === 'string' ? s.response : JSON.stringify(s.response, null, 2)}</pre>
            </>
          )}
        </section>
      ))}
    </article>
  );
}

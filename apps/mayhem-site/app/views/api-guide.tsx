// The API guide (/api-guide): how do I connect an app? One fold per endpoint instead of a long page
// (the first one open). Sections in api-guide.json (title, text and the examples).
import sections from './api-guide.json';

export default function Guide() {
  return (
    <article className="prose">
      <h1>Connect an app.</h1>
      <p>
        {'Fixed base address: '}
        <code>https://mayhemstats.lol/api</code>
        {'. '}
        <a href="/example-game-upload.json" download>
          Download an example upload.json (made-up test values)
        </a>
      </p>
      {sections.map((s, i) => (
        <details key={s.title} className="fold" open={i === 0}>
          <summary>
            <h2>{s.title}</h2>
          </summary>
          <p>{s.text}</p>
          {s.request && <pre>{s.request}</pre>}
          {s.response && (
            <>
              <p>Example response:</p>
              <pre>{typeof s.response === 'string' ? s.response : JSON.stringify(s.response, null, 2)}</pre>
            </>
          )}
        </details>
      ))}
    </article>
  );
}

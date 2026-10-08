// The API guide (/api-guide). Sections in api-guide.json (title, text and the examples).
import sections from './api-guide.json';

export default function Guide() {
  return (
    <article className="prose">
      <h1>Connect an app.</h1>
      <p>
        {'Fixed base address: '}
        <code>https://mayhemstats.lol/api</code>
      </p>
      <p>
        <a href="/example-game-upload.json" download>
          Download an example upload.json (made-up test values)
        </a>
      </p>
      {sections.map((s) => (
        <section key={s.title}>
          <h2>{s.title}</h2>
          <p>{s.text}</p>
          {s.request && <pre>{s.request}</pre>}
          {s.response && (
            <>
              <p>Example response:</p>
              <pre>{typeof s.response === 'string' ? s.response : JSON.stringify(s.response, null, 2)}</pre>
            </>
          )}
        </section>
      ))}
    </article>
  );
}

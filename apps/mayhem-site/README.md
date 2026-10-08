# blank. Mayhem

Public Sites website and D1-backed JSON API for the blank. desktop app.

- Original rating files: maltekruse23-oss/blank commit 7c875fd592502ed016420607a846cf0743f0e0cd, RATING_VERSION=1; copied byte-for-byte.
- AramEntry, AramSeat and associated type declarations are extracted without changes from src/adapters/aram.ts in that commit. Runtime Tauri imports are intentionally omitted.
- API contract, curl examples, security boundaries and operations: API.md.
- The site is English only (user decision 08.10.2026). Pages live in app/views, routes in app/<page>/page.tsx, number and date formats in app/ui/format.ts. Old German addresses (/de/…, /rangliste …) redirect permanently via redirects.ts. The API keeps its German labels and error messages; pages translate known messages (app/ui/data.ts).
- Database: db/schema.ts and generated drizzle migrations. Never edit an already deployed migration.
- No production sample records. Tests run against local D1 only.

Local development: install locked dependencies, generate/apply D1 migrations using the Sites workflow, then run the dev script. Integration tests: node tests/integration.mjs while local preview runs at 127.0.0.1:5173. Smoke test of every page and reading endpoint (empty and filled): node tests/smoke.mjs, same preview. Publishing: DEPLOY.md. The tests create and remove fictional players in the local database. Never point these tests at production.

Desktop integration still needs to be wired into blank.: send only queue 2400, store a random personal 32-byte token in Windows credential storage BEFORE the first request and send its 64 lowercase hexadecimal characters as Authorization: Bearer. Reuse it on retries and later uploads. Fetch all needed season entries (including improved older matches), honor disputed exclusions and group since, then use the same original standings(). Handle SSE game/reset and 429 Retry-After. No shared secret belongs in an open-source app.

The registration mechanism is trust-on-first-use, not proof of Riot account ownership. Lobby comparison detects disagreement, not authenticity. Operators must supply their own privacy contact details. Hosting platform log retention is not controlled by this application.

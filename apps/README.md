# Mayhem-Zusatzprojekte

- `mayhem-collector/`: eigenständige kleine Windows/Tauri-2-App; UI in `ui/`, Rust in
  `src-tauri/`. Im Rust-Ordner: `cargo test --locked` und `cargo clippy --locked --all-targets -- -D warnings`.
  Für die Release-EXE Tauri CLI 2 im Collector-Projekt benutzen (`tauri build --no-bundle`),
  nicht lediglich `cargo build --release`.
- `mayhem-site/`: Quellstand der bestehenden veröffentlichten Sites-Website. Eigenes npm-Projekt:
  `npm ci`, `npx tsc --noEmit`, `npm run build`. Veröffentlichung über den Sites-Workflow mit
  bestehender Projekt-ID. Die Deployment-Dateien unter `public/downloads/` bleiben außerhalb Git
  und müssen aus dem bestehenden Deployment-Checkout erhalten werden.

Kein gemeinsamer Root-Build: Root-ESLint und Root-Prettier ignorieren diese unabhängigen Projekte.
Die vollständige Übergabe, Grenzen der Tests und offene Aufgaben stehen in
`../CLAUDE-HANDOFF-MAYHEM.md`.

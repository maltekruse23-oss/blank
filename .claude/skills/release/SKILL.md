---
name: release
description: Arbeitsablauf, Prüfungen, Versionen, Release, Updates und Twitch-Client-ID. Nutzen vor Builds, Tests, Versionsnummern, Tags und Releases.
---

Wörtliche Kopie der Regeln aus CLAUDE.md (dort weiterhin maßgeblich).

- Vor Änderungen Git-Status prüfen; Benutzeränderungen nicht überschreiben. Kein Commit/Push ohne Auftrag.

- `pnpm install --frozen-lockfile`, dann `pnpm build`, `pnpm lint` (React-Hooks-Regeln; bewusste Ausnahmen nur mit `// eslint-disable-next-line react-hooks/exhaustive-deps -- Grund`) und `pnpm test` (Vitest). Dieselben Prüfungen plus Rust-Tests und Clippy unter Windows laufen bei jedem Pull Request und Push auf `main` (`.github/workflows/check.yml`) und im Release-Ablauf. Vor einem Release die Klick-Prüfung „Vor jedem Release“ aus VALIDATION auf Windows.

- Betroffene Seiten in der Vorschau prüfen. Bei nativen Änderungen `pnpm desktop:build` auf Windows mit Rust/MSVC prüfen.

- Die Release-EXE nur mit `pnpm desktop:build` bauen, nie mit `cargo build --release`: Ohne das von der Tauri-CLI gesetzte Feature `custom-protocol` lädt die EXE den Dev-Server (127.0.0.1:1420) und zeigt nur eine Fehlerseite. `cargo check` ist unkritisch. Nach dem Build die EXE starten und sichtbar prüfen.

- Mindestens Navigation, Twitch-Live-Filter/Kanalverwaltung/Leerzustand, Pros-Filter und persistierte Einstellungen prüfen, wenn diese betroffen sind.

- Twitch für Freunde: eine eigene Client-ID des Benutzers kann beim Release eingebaut werden – nur über die GitHub-Repository-Variable `TWITCH_CLIENT_ID` (release.yml → `BLANK_TWITCH_CLIENT_ID`, `option_env!` in `twitch/mod.rs`), nie im Code (Konto des Benutzers). Eine selbst eingetragene Client-ID geht vor; ohne eigene zeigt die Twitch-Karte kein „Client-ID ändern“ (`builtIn`); Export enthält nur die eigene.

- Updates (`update.rs`, Settings → System): nur aus `maltekruse23-oss/blank`-Releases, Asset `blank.exe` mit GitHub-SHA-256 (ohne passende Prüfsumme kein Update), Installation nur auf Klick, automatische Prüfung höchstens einmal täglich und abschaltbar. Die neue EXE startet mit `--after-update <pid>`, wartet auf das Ende der alten und löscht `.old`; der Name `blank.exe` im Release darf sich nicht ändern. Danach zeigt sie einmal „Neu in Version …“ (Benutzerwunsch „Patch Notes nach dem Update“; `update_news`, `app/PatchNotes.tsx`): den Abschnitt „Neu in dieser Version“ aus `.github/release-notes.md`, fest eingebaut, ohne Internet; jederzeit wieder über Settings → System → Neuigkeiten.

- Neue Version: Versionsnummer in `package.json`, `src-tauri/Cargo.toml` und `src-tauri/tauri.conf.json` gleich anheben, committen, Tag `vX.Y.Z` pushen (nur auf Auftrag); GitHub Actions prüft, baut und hängt immer gleich benannt `blank.exe` (und `blank-extension.zip`, die Browser-Erweiterung; der Updater nimmt nur `blank.exe`) an das Release (der README-Link `releases/latest/download/blank.exe` hängt daran; Release-Text in `.github/release-notes.md`, dort „Neu in dieser Version“ für jede Version neu schreiben). Die EXE ist nicht signiert. Der obere README-Teil ist für Nicht-Entwickler: einfach halten.

- Lockfile behalten; Cargo.lock bei der ersten erfolgreichen nativen Auflösung erzeugen und für die App versionieren.

- README/VALIDATION bei geänderter Architektur oder neuem Prüfstand aktualisieren. Blockierte Prüfungen ehrlich benennen.


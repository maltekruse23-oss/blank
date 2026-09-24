# blank. — Regeln für die Weiterentwicklung

## Ausgangslage

Private Windows-App. Stack: Tauri **2**, React, TypeScript (strict), Vite, pnpm. Sichtbarer Name immer `blank.`; technische Namen `blank`. Echte Integrationen (je auf Benutzerauftrag): Twitch (Helix), Akkustände (HID, nur lesend), PC-Status (Windows, nur lesend) — diese nur in der Desktop-App — und SoundCloud-Mixes (offizieller eingebetteter Player). Die Browser-Vorschau nutzt Mock-Daten für Twitch. Der Code liegt öffentlich auf GitHub; Download als einzelne EXE über GitHub Releases (`.github/workflows/release.yml`, ausgelöst durch einen Tag `vX.Y.Z`). Keine persönlichen Daten des Benutzers (Hardware, Geräte, Konten, Kanäle, Pfade) in Code oder Doku. Lies zuerst README.md und VALIDATION.md.

## Architekturregeln

1. Die sieben Bereiche Home, Twitch, Pros, Musik, Devices, PC, Settings bleiben modular in `src/features/` (der League-Platzhalter wurde auf Benutzerwunsch entfernt). Die Pro-Liste (`src/data/proStreamers.ts`) ist echt und von Hand gepflegt; neue Einträge vorher per Twitch-API prüfen, keine Seiten zur Laufzeit auslesen. Jeder Eintrag hat Lane und Champions (Data-Dragon-IDs); Champion-Icons nur vom Data-Dragon-CDN laden, nicht ins Repo kopieren.
2. Gemeinsame UI in `src/components/`; Farben/Abstände/Radien primär in `src/styles/tokens.css` ändern.
3. Fiktive Daten in `src/data/mock.ts`; keine duplizierten Datenquellen in den Seiten.
4. Neue API-/Hardware-Integrationen erst nach entsprechendem Benutzerauftrag. Kein Scraping, keine versteckte Telemetrie, keine automatische Account-Anbindung.
5. Datenzugriff künftig über typisierte Adapter. Erfolg, Laden, Fehler, Offline und fehlende Werte explizit modellieren. Fehlende Akkus/Messwerte nie als 0 darstellen.
6. Keine unnötigen Abhängigkeiten, globalen Stores oder Router hinzufügen. Bestehende UI-Komponenten wiederverwenden.
7. Keine Secrets im Frontend, in `VITE_*`, localStorage oder Git. localStorage enthält momentan nur harmlose Präferenzen (kompakt, Animationen, Live-Ton, Lautstärke, Farbschema, Pet-Figur, Nicht stören, Akku- und Überlast-Warnung), die Mock-Kanalauswahl der Browser-Vorschau (`blank.twitch.watchlist.v1`) und die SoundCloud-Accounts mit Musik-Lautstärke (`blank.music.v1`). Der Twitch-Token bleibt in Rust und der Windows-Anmeldeinformationsverwaltung; neue Rust-Befehle zusätzlich in `build.rs` (App-Manifest) und `capabilities/default.json` freigeben.
8. Tauri-Capabilities und CSP minimal halten. Keine pauschalen Shell-, Dateisystem- oder Netzwerkberechtigungen vergeben.
9. Browser-Vorschau lauffähig halten; native Aufrufe nur in isolierten Adaptern, niemals beim Import einer Seite.
10. Keine fremden Markenlogos/Assets aus Designreferenzen kopieren. Lucide-Symbole und eigene CSS-/SVG-Grafiken verwenden. App-Icon (Taskleiste, Infobereich, EXE) bleibt neutral schwarz/weiß und unabhängig von den Farbschemata (Benutzerwunsch); Quelle `src-tauri/icons/icon.svg`, nach Änderung von `icon.ico` `build.rs` berühren, sonst bleibt das alte Icon in der EXE.

## UX-Regeln

- Fenster voll deckend. Das frühere Transparenz-Konzept (Layered-Window-Alpha) wurde auf Benutzerwunsch verworfen; nicht wieder einführen. Keine Click-through-Styles hinzufügen. Ausnahme nur für den Pet-Modus (Benutzerauftrag): Das Fenster ist technisch transparent (`transparent: true`, kein `backgroundColor`), die normale App malt ihren Hintergrund selbst voll deckend — nie eine halbtransparente App.
- „Nicht stören“ nur per Knopf (Titelleiste/Settings), nie automatisch: kein Ton, Pet bleibt im Hintergrund, Meldungen erscheinen still. Warnungen (Akku, Überlast) knapp mit Ursache; Schwellen und Pausen in `pc.rs`, dort per Unit-Test abgesichert. Programme nur auf Klick schließen: erst normal (`WM_CLOSE`), erzwingen nur nach erneutem Klick; Windows-Systemprozesse und blank. selbst nie (Liste `PROTECTED` in `pc.rs`).
- Pet-Modus (`src-tauri/src/pet.rs`, `src/features/pet/`): nur während einer Meldung im Vordergrund (ohne Fokus zu nehmen, nicht bei „Nicht stören“), sonst normales Fenster, Fenster nur so groß wie das Pet (wächst nur für die Sprechblase), keine Dauer-Animationen (Blinzeln/Hüpfen nur kurz und nur mit eingeschalteten Animationen), eigene Figuren (`figures.ts`: „Minimal“ Standard, „Blob“; neue Figuren dort eintragen, gleiche Props und Stimmungen inkl. „worried“ für Warnungen), Live-Meldungen knapp (wer ist live). Taskleisten-Knopf, Tray-Symbol und zweiter Start zeigen immer die ganze App, nie das Pet (`pet.rs`, `taskbar.rs`, `tray.rs`, Ereignis `show-app`); die Knopf-Erkennung per UI Automation bleibt nur lesend und läuft nie im Fenster-Nachrichten-Handler selbst.

- Ausschließlich private Desktop-App, keine Website/Landingpage. Kleines Fenster mit festem Seitenverhältnis 860 : 640 (720 × 536 bis 1000 × 744, `src-tauri/src/window_aspect.rs`); der Inhalt wird mitgezoomt und ist immer exakt 860 × 640 CSS-Pixel. Layout für genau diese Fläche gestalten: Übersichtsseiten füllen sie ohne Scrollen, Listen scrollen. Maximieren deaktiviert, kein Vollbild. Keine Begrüßungen, Werbetexte, Breadcrumbs oder erklärenden Absätze in der normalen Oberfläche. Ein globaler dezenter Mock-Hinweis genügt. Kompaktes Layout in `src/styles/desktop.css`.

- Geringer Ressourcenverbrauch hat Vorrang (App läuft dauerhaft im Hintergrund): keine Dauer-Animationen, keine Abfragen ohne Nutzen bei minimiertem Fenster (`document.hidden`), WebView2-Argumente in `tauri.conf.json` beibehalten (`--disable-gpu --in-process-gpu`). Änderungen mit der Live-Auslastung in der Titelleiste bzw. Messung prüfen.
- Nur eine Instanz (`src-tauri/src/single_instance.rs`); Symbol im Infobereich (`tray.rs`: Öffnen, Beenden), das X beendet die App; Einstellungen werden bei jeder Änderung sofort gespeichert. Start mittig auf dem zweiten Monitor (`src-tauri/src/monitor.rs`). Autostart nur über den eigenen Run-Eintrag (`autostart.rs`), nie ohne Schalterbedienung aktivieren.
- Rahmenloses Fenster (`decorations: false`) mit eigener Titelleiste in `src/app/TitleBar.tsx`; native Fensteraufrufe nur über `src/platform/window.ts`. Kein Maximieren per Doppelklick. Eigene schmale Scrollbar in `desktop.css`.
- Sehr dunkles Grün/Schwarz, dezente grüne Akzente und ruhige abgerundete Cards. Standard-Farbschema „Wald“; weitere Schemata (Settings) nur über die Paletten in `tokens.css` — keine festen Farbwerte in Komponenten-CSS, sondern Tokens bzw. `color-mix()` aus Tokens. Aufbau: Sidebar mit Abschnitten und Profilblock auf dunklem Rahmen, Inhalt im eingerahmten Panel (`.panel`), Seitenkopf mit Symbol-Kachel, Status-Badge in der Titelleiste (Richtung DPM-App, keine fremden Assets).
- Mock-Status darf nicht verschwinden, solange die Daten simuliert sind. Die Twitch-Seite zeigt mit echten Daten das Badge „Twitch“ statt „Mock“.
- Übertragen (Settings, `settings_file.rs`, `features/settings/settingsFile.ts`): Export und Import enthalten alle gespeicherten Einstellungen; neue Einstellungen dort mit aufnehmen (Export und strenge Prüfung beim Import), bei inkompatibler Änderung `SETTINGS_FORMAT` erhöhen. Nie Twitch-Token oder Autostart. Import ersetzt erst nach Bestätigung.
- Musik nur über SoundClouds offiziellen eingebetteten Player (`src/adapters/soundcloud.ts`, eigenes postMessage-Protokoll statt fremdem Skript in der App) und oEmbed; nichts herunterladen oder zwischenspeichern; Track, Uploader und „SoundCloud“ mit Links sichtbar lassen. Der Player existiert nur während eines Mixes, keine Dauer-Abfragen (Position nur sichtbar und 1×/s).
- Keine vorgetäuschten Live-Verbindungen oder wirkungslosen aktiven Buttons. Geplante Funktionen als geplant kennzeichnen.
- Keyboard-Fokus, zugängliche Labels, responsive Layouts und reduzierte Bewegung erhalten.

## Arbeitsablauf

- Vor Änderungen Git-Status prüfen; Benutzeränderungen nicht überschreiben. Kein Commit/Push ohne Auftrag.
- `pnpm install --frozen-lockfile`, dann `pnpm build`.
- Betroffene Seiten in der Vorschau prüfen. Bei nativen Änderungen `pnpm desktop:build` auf Windows mit Rust/MSVC prüfen.
- Die Release-EXE nur mit `pnpm desktop:build` bauen, nie mit `cargo build --release`: Ohne das von der Tauri-CLI gesetzte Feature `custom-protocol` lädt die EXE den Dev-Server (127.0.0.1:1420) und zeigt nur eine Fehlerseite. `cargo check` ist unkritisch. Nach dem Build die EXE starten und sichtbar prüfen.
- Mindestens Navigation, Twitch-Live-Filter/Kanalverwaltung/Leerzustand, Pros-Filter und persistierte Einstellungen prüfen, wenn diese betroffen sind.
- Neue Version: Versionsnummer in `package.json`, `src-tauri/Cargo.toml` und `src-tauri/tauri.conf.json` gleich anheben, committen, Tag `vX.Y.Z` pushen (nur auf Auftrag); GitHub Actions prüft, baut und hängt immer gleich benannt `blank.exe` an das Release (der README-Link `releases/latest/download/blank.exe` hängt daran; Release-Text in `.github/release-notes.md`). Die EXE ist nicht signiert. Der obere README-Teil ist für Nicht-Entwickler: einfach halten.
- Lockfile behalten; Cargo.lock bei der ersten erfolgreichen nativen Auflösung erzeugen und für die App versionieren.
- README/VALIDATION bei geänderter Architektur oder neuem Prüfstand aktualisieren. Blockierte Prüfungen ehrlich benennen.

## Noch nicht umgesetzt

League-Client oder externe Spieldaten, Bluetooth und weitere HID-Geräte (umgesetzt: nur lesende Akkuabfrage für Logitech HID++ und HyperX Cloud Alpha Wireless in `battery.rs`; nie Einstellungen an Geräten schreiben), PC-Temperaturen und -Sensoren über Zusatztreiber (umgesetzt: Auslastung von CPU, RAM, Grafikkarte und Systemlaufwerk sowie Programme mit der meisten Last in `pc.rs`, nur lesend), Installer, Updater, Signierung, weitere Accounts oder Twitch-Scopes und weitere Secret-Speicher. Nicht eigenständig ergänzen.

# Prüfstand — 22. September 2026 (native Windows-Prüfung)

## Umgebung

Windows 11 Home 10.0.26200 (x64, 96 DPI), WebView2 153.0.4234.48, Node.js 24.19.0, pnpm 11.25.0, Rust 1.98.1 (stable-x86_64-pc-windows-msvc, rustup 1.29.1), Visual Studio Build Tools 2022 17.14 mit „Desktopentwicklung mit C++“ und Windows SDK 10.0.26100. `pnpm tauri info` meldet keine fehlenden Voraussetzungen. Aufgelöst: tauri 2.11.6, wry 0.55.1, tao 0.35.3, windows-sys 0.61.2.

## Erfolgreich

- `pnpm install --frozen-lockfile`, `pnpm build` (TypeScript strict + Vite), `pnpm format:check` und `cargo fmt --check`.
- `pnpm desktop:build`: Release-Build ohne Compiler-Warnungen, `src-tauri/target/release/blank.exe` (~8,4 MB). `Cargo.lock` erzeugt und zur Versionierung vorgesehen.
- Nativer Start im echten Desktopfenster, Titel `blank.`, keine Konsole.
- Fenstergröße: Client-Fläche beim Start 860 × 640. Grenzen beim Ziehen siehe „Rahmenloses Fenster“.
- Maximieren: `WS_MAXIMIZEBOX` fehlt, „Maximieren“ im Systemmenü deaktiviert. Kein Vollbild.
- Transparenz: `WS_EX_LAYERED` mit `LWA_ALPHA` 235 aktiv. Gemessen gegen eine helle Referenzfläche hinter dem Fenster: effektive Deckkraft 0,918–0,926 je Farbkanal (Soll 0,922). Kein Click-through (`WS_EX_TRANSPARENT` fehlt), kein Always-on-top. Die Deckkraft bleibt auch nach Aus- und Einblenden erhalten.
- Lesbarkeit: Bei Start- und Mindestgröße sind Navigation, Überschriften, Werte und Mock-Hinweis klar lesbar. Vor hellen oder textreichen Fenstern scheinen deren Inhalte schwach durch (gewollte ~8 % Transparenz); das stört die Lesbarkeit der App-Texte nicht. Bei Bedarf `WINDOW_ALPHA` erhöhen.
- Browser-Vorschau bei 720 × 520 und 860 × 640: alle sechs Bereiche ohne horizontalen Überlauf und ohne Konsolenfehler.

## Rahmenloses Fenster (Benutzerauftrag)

Native Titelleiste und klassische Scrollbar ersetzt: `decorations: false`, eigene 36-px-Titelleiste (`src/app/TitleBar.tsx`) mit Minimieren/Schließen (Lucide), schmale abgerundete Scrollbar ohne Pfeile, die erst unter der Titelleiste beginnt. Neue Abhängigkeit `@tauri-apps/api` 2.11.1 (passend zu tauri 2.11). Capabilities nur `core:window:allow-start-dragging`, `allow-minimize`, `allow-close`.

- Release-Build ohne Warnungen; Client-Fläche 860 × 640; `WS_EX_LAYERED` mit Alpha 235 bleibt aktiv.
- Windows-11-Ecken abgerundet. Kein DWM-Schatten (bei Layered-Fenstern systembedingt).
- Resize-Hit-Tests an allen Rändern und Ecken korrekt (links/rechts/oben/unten/Ecke), Titelleiste ist Client-Fläche.
- Minimieren-Knopf per simuliertem Klick im WebView geprüft: Fenster minimiert, Wiederherstellen funktioniert.
- Doppelklick auf die Ziehfläche startet absichtlich kein Ziehen/Maximieren (`event.detail > 1` wird ignoriert).
- Browser-Vorschau bei 860 × 640: kein Body-Scroll, Scrollbereich ab 36 px, keine Fensterknöpfe (keine wirkungslosen Buttons), Konsole fehlerfrei.
- Abweichung: tao meldet bei rahmenlosen Fenstern `WM_GETMINMAXINFO` ohne die unsichtbaren 8-px-Resize-Ränder. Effektive Client-Grenzen beim Ziehen daher ca. 704 × 511 bis 984 × 751 statt 720 × 520 bis 1000 × 760. Layout bleibt in diesem Bereich überlauffrei.
- Nicht automatisiert geprüft: Ziehen des Fensters (Windows-Verschiebeschleife folgt der echten Maus), Schließen-Knopf. Manuell prüfen.

## Neues Design „Arena“ (Benutzerauftrag)

Vorlage: Screenshots einer Gaming-Begleit-App (nur Stil übernommen, keine Logos, Maskottchen oder Bilder). Zweites Design neben „Klassisch“, wählbar unter Settings → Darstellung → Design mit kleiner Vorschau je Design; bei Arena sind die Farbschema-Punkte deaktiviert („Arena hat eigene Farben“). Die Einstellung gehört zu den Präferenzen und wird mit exportiert/importiert.

- Vorschau (860 × 640): Home mit großem Titel, Trennstrich und Kurzzeile, Kartentitel in Großbuchstaben mit Indigo-Balken, dunkles Blau-Schwarz; Settings mit Design-Auswahl (Klassisch in Wald, Arena in Indigo). PC-Seite mit Beispielwerten gerendert: Symbolkacheln orange/grün/lila/gold, kein Überlauf.
- Nativ in Arena: Home, PC, Devices, Musik, Twitch ohne vertikalen oder horizontalen Überlauf. Bildschirmaufnahmen waren nicht möglich, weil ein anderes Fenster über der App lag (Aufnahmen verworfen); visuell geprüft wurde deshalb nur in der Vorschau.
- Das Design des Benutzers steht danach auf „Arena“; zurück jederzeit in den Settings.

## Pet reagiert auf Musik, zwei neue Figuren (Benutzerauftrag)

Neue Stimmung „music“ für alle Figuren (Kopfhörer mit hellem Rand über dem Kopf, geschlossene Augen, Note), neue Figuren „Katze“ und „Robo“ mit allen fünf Stimmungen. Rangfolge: Warnung > Live-Meldung > Musik > wach/schlafend. Kurzes Nicken bei neuem Track nur mit eingeschalteten Animationen, keine Daueranimation.

- Vorschau: alle 4 Figuren × 5 Stimmungen als Übersicht gezeichnet (Farbschemata Graphit und Wald, Musik zusätzlich auf hellem Hintergrund); daraufhin Kopfhörerbügel mit hellem Rand versehen (vorher auf dunklem Grund kaum sichtbar) und „besorgt“ bei Katze/Robo korrigiert (wirkte wütend). Settings: vier Figuren passen in die Zeile (208 px), Auswahl „Robo“ sofort gespeichert.
- Nativ (Mix mit Lautstärke 0): Pet-Modus mit laufendem Mix → `mood-music`, Kopfhörer und Note vorhanden, Tooltip „♪ <Track> – <Uploader> · 1 Kanal live …“; Pause → `mood-awake`, Weiterspielen → `mood-music`. Bildschirmaufnahme des Pets auf dem Desktop: Kopfhörer gut sichtbar. Musik-Lautstärke danach zurückgesetzt.

## RAM bereinigen wie Mem Reduct (Benutzerauftrag)

Knopf „Bereinigen“ in der RAM-Karte der PC-Seite. Ablauf: Die App startet sich selbst mit `runas` (`blank.exe --clean-memory`, Windows-Nachfrage), der Prozess aktiviert `SeProfileSingleProcessPrivilege` und `SeIncreaseQuotaPrivilege`, leert per `NtSetSystemInformation(SystemMemoryListInformation)` die Arbeitsspeicher aller Prozesse, leert den Dateicache (`SetSystemFileCacheSize(-1, -1)`), schreibt die geänderten Seiten weg, leert die Standby-Liste ohne Priorität und beendet sich; fehlgeschlagene Schritte stehen als Bits im Exit-Code. Die App misst belegten RAM vorher und nachher.

- Ohne Adminrechte gestartet (`blank.exe --clean-memory` direkt): endet nach ~1 s ohne Fenster und ohne App-Start, Exit-Code 23 (Rechte, Arbeitsspeicher, Dateicache, Standby abgelehnt; „geänderte Seiten wegschreiben“ geht auch ohne Rechte). Die Ablehnungsprüfung richtet sich deshalb nach fehlendem Recht plus Arbeitsspeicher.
- Nativ: Knopf neben dem RAM-Symbol, überdeckt weder Symbol noch Titel, PC-Seite ohne Überlauf.
- **Nicht automatisiert geprüft:** der eigentliche Lauf mit Adminrechten (die Windows-Nachfrage muss der Benutzer bestätigen), Abbrechen der Nachfrage („Abgebrochen – ohne Administratorrechte geht es nicht.“) und die angezeigte Menge.

## Download über GitHub (Benutzerauftrag)

Öffentliches Repository `maltekruse23-oss/blank`; vor dem Hochladen persönliche Testdetails (Hardware, Geräte, laufende Programme, Musik-Accounts) aus VALIDATION.md entfernt und alle Dateien nach Tokens, E-Mail-Adresse und Benutzerpfaden durchsucht (nichts gefunden). Commits mit der anonymen GitHub-Adresse. Nur die EXE, kein Installer (Benutzerwahl).

- GitHub Actions (Tag `v0.1.0`, windows-latest): Versionsprüfung, `pnpm install --frozen-lockfile`, `pnpm format:check`, `cargo test --locked`, `pnpm desktop:build`, Release — alle Schritte erfolgreich, EXE 13 MB.
- Die von GitHub gebaute EXE heruntergeladen und gestartet: lädt die App (`http://tauri.localhost`, nicht den Dev-Server), alle sieben Bereiche, echte Twitch-Daten.
- Auf Wunsch des Benutzers vereinfacht: Datei heißt immer `blank.exe`, README beginnt mit Download-Link und drei Schritten, Release-Text auf Deutsch, Repository-Link „Website“ zeigt auf das neueste Release.
- Hinweis: Der Projektordner gehört technisch einem anderen Windows-Konto (frühere Sitzung); Git lehnt ihn deshalb ab („dubious ownership“). Befehle liefen mit `git -c safe.directory=<Ordner>`; die globale Git-Einstellung wurde nicht geändert.

## Einstellungen übertragen (Benutzerauftrag)

Settings → Übertragen: Export schreibt `blank-einstellungen.json` (freier Name, sonst „(2)“ usw.) in den Downloads-Ordner (`SHGetKnownFolderPath`, auch verschoben) und zeigt sie im Explorer; Rust ergänzt Twitch-Kanäle und Client-ID. Import über den Windows-Dateidialog der WebView, strenge Prüfung je Teil, Übernehmen erst nach Bestätigung. Nie enthalten: Twitch-Token, Autostart.

- Rust-Tests (`cargo test`: 9): nur blank.-Objekte bis 512 KB; erster freier Dateiname.
- Vorschau: kein JSON / andere App → „Keine blank.-Einstellungsdatei.“; Format 99 → „Datei stammt aus einer neueren blank.-Version.“ Gültige Datei → Prüfanzeige „Darstellung, Pet und Benachrichtigungen · 2 Musik-Einträge · 2 Twitch-Kanäle · exportiert am …“; nach „Übernehmen“ Farbe Graphit, kompakt, ohne Animationen, Pet Blob, Nicht stören, Akku-Warnung aus, 2 Playlists mit Lautstärke 35, Kanäle mit Spielregel übernommen; ein Eintrag mit fremder Adresse und ein ungültiger Kanalname wurden verworfen.
- Nativ: Export → Datei in Downloads (4 KB) mit `app, exportedAt, format, music, preferences, twitch`, 10 Kanäle, Client-ID gesetzt, keine Token-Felder. Dieselbe Datei wieder importiert: Einstellungen, Musik (inhaltlich; Rust sortiert nur die Schlüssel) und Kanäle unverändert, Twitch-Login bleibt verbunden.

## Neutrales App-Icon (Benutzerauftrag)

Altes Icon: grünes „b.“ im Grün des Farbschemas „Wald“ auf voll gefülltem Quadrat. Neu: weißes „b.“ auf fast schwarzer, abgerundeter Kachel (#111, feiner heller Rand), außen durchsichtig; Quelle `src-tauri/icons/icon.svg`, per `pnpm tauri icon` in 16/24/32/48/64/256 px erzeugt, nur `icon.ico` übernommen.

- Vorschau aller Größen auf dunkler (#202020) und heller (#F3F3F3) Taskleistenfarbe: auch 16 px lesbar.
- Gefundener Stolperstein: Nach dem Austausch von `icon.ico` zeigte die neu gebaute EXE (geprüft an einer frisch kopierten Datei, also ohne Windows-Icon-Cache) weiter das alte Icon, das Fenster-Icon dagegen schon das neue. Tauris Build-Skript lief nicht neu. Nach Berühren von `build.rs` und erneutem `pnpm desktop:build` enthält die EXE das neue Icon.
- Echte Taskleiste nach dem Start: neues Icon am Knopf „blank. - 1 running window“; Tray-Symbol und Fenster nutzen dasselbe Icon.

## Musik: SoundCloud-Mixes (Benutzerauftrag)

Vorab geprüft: SoundClouds Nutzungsbedingungen verlangen Nennung von Uploader und SoundCloud sowie sichtbare Links auf soundcloud.com, nichts herunterladen/zwischenspeichern, Werbung nicht stören; für den eingebetteten Player keine API-Registrierung. oEmbed (`soundcloud.com/oembed`) ohne Schlüssel, mit CORS; unbekanntes Profil → 404. Das Nachrichtenformat des Players (`{method, value}` per postMessage) aus SoundClouds `api.js` gelesen; das Skript selbst wird nicht geladen.

- Browser-Vorschau (Lautstärke 0): „not a profile!!“ → „Kein SoundCloud-Profil …“, unbekanntes Profil → „Profil nicht gefunden.“, Track-Link `soundcloud.com/forss/flickermood` → Profil „Forss“ mit Bild, erneut „forss“ → „Ist schon in der Liste.“ Mix startet nach 1,7 s; „Nächster“ wechselt den Track; Pause/Weiter; Sprung kurz vor Track-Ende → nächster Zufallstrack; „Stopp“ entfernt den Player.
- Nativ (Debug-Port, Lautstärke 0): CSP lässt oEmbed, Profilbild und Player zu, Badge „SoundCloud“, Mix spielt nach 1,5 s. Weiterspielen geprüft über die Position des Players: sichtbar 18,8 s → 25 s minimiert 45,3 s → Pet-Modus 56,6 s → zurück zur App 62,1 s, gleicher Track, nie pausiert. Positionsanzeige läuft sichtbar mit (0:03 → 0:05); bei verdeckter/minimierter Seite wird sie absichtlich nicht abgefragt.
- Verbrauch minimiert (30 s): mit laufendem Mix 0,157 % CPU, 200 MB privat (Player-Prozess 68 MB); nach „Stopp“ Player-Prozess beendet, 0,007 % CPU, 132 MB.
- `soundcloud_open` lehnt fremde Hosts und `file:`-Pfade ab („Kein SoundCloud-Link“); Rust-Test `accepts_profiles_and_tracks_only_on_soundcloud` bestanden (`cargo test`: 7). Das tatsächliche Öffnen im Browser wurde nicht ausgelöst (gleiche Funktion wie bei Twitch).
- Testdaten (`blank.music.v1`) danach entfernt; Einstellungen des Benutzers unverändert.
- Nachtrag (Rückmeldung: ein Profil meldete „Keine Tracks zum Abspielen“): Das Profil hat keine eigenen Uploads (Player meldet 0 Tracks, auch nach 6 s), die Musik liegt in einer Playlist des Accounts (36 Tracks). Neu: Playlist-Links (`…/sets/…`, Tracking-Parameter werden entfernt; Titel ohne „by …“, Bild des Besitzers, Zeile „Playlist · <Besitzer>“), klarere Meldung für Profile ohne eigene Tracks. Zweiter Fehler dabei gefunden: Playlists laden Track-Daten nach und nach (5 → 20 → 36 in 6 s); ein Sprung auf einen noch nicht geladenen Track wählt ihn aus, startet ihn aber nicht (kein „play“, kein Fehler). Behoben: nach dem Sprung bis zu 4× alle 1,5 s nachfragen und erneut starten; eigenes Pause/Springen beendet das sofort. Außerdem zählt der Mix nachgeladene Tracks eines Profils mit (forss: 10 → 12).
- Geprüft (Lautstärke 0): Vorschau — Playlist-Mix startet nach 2,1 s, 5× „Nächster“ je ~0,8 s, jedes Mal wirklich spielend; eigenes Pause hält 7 s (keine Wiederholung). Nativ — Playlist über den geteilten Link hinzugefügt, Mix nach 2,6 s, „Nächster“ nach 1,6 s, spielt. Musik-Lautstärke danach wiederhergestellt.
- **Nicht geprüft:** hörbarer Ton (alle Tests mit Lautstärke 0), sehr große Accounts (der Player lädt die Trackliste selbst; gemischt wird unter den geladenen Tracks), Go+-Vorschauen.

## League-Bereich entfernt (Benutzerauftrag)

Seite `src/features/league/`, Navigationspunkt, Home-Karte „League Assistant“, Settings-Eintrag „League-Datenquelle“ (geplant) und alle nur dafür genutzten Styles entfernt. Die Pros-Seite und die Twitch-Spielregeln („nur League“) bleiben.

- Home: „Twitch Live“ jetzt zweizeilig links (bis zu 6 Live-Kanäle, dann „+N weitere live“), „Dein Setup“ und „PC-Status“ rechts. Browser-Vorschau bei 860 × 640: kein Überlauf, auch mit 6 eingefügten Zeilen plus Hinweis (Test-DOM, danach entfernt); Konsole fehlerfrei.
- Badge: Home in der Desktop-App „Live“ statt „Mock“ (nichts mehr simuliert), Settings ohne Badge; Browser-Vorschau weiterhin „Mock“. Settings-Karte „Verbindungen“ nur noch in der Browser-Vorschau („Twitch-Account · Nur in der Desktop-App“).
- Nativ (Debug-Port): Navigation Home, Twitch, Pros, Devices, PC, Settings; Home-Badge „Live“, kein Überlauf; Settings mit Darstellung, Twitch, Benachrichtigungen, System. `pnpm build`, `pnpm format:check`, `pnpm desktop:build` erfolgreich; danach normal ohne Debug-Port gestartet.

## Taskleiste zeigt die ganze App, Symbol im Infobereich (Benutzerauftrag)

- Tray-Symbol „blank.“ erscheint im Überlauf-Bereich (per UI Automation in der geöffneten Liste gefunden, neben den Symbolen anderer Programme).
- Tray-Klick (UI-Automation-„Invoke“ auf das Symbol): aus dem Pet-Modus → ganze App an alter Stelle (−1398,191, 860 × 640), Pet-Modus aus, Fenster aktiv; aus dem minimierten Zustand → wiederhergestellt und aktiv.
- Zweiter Start bei minimiertem Pet → ganze App, aktiv, weiterhin ein Prozess.
- Erkennung des eigenen Knopfs gegen die echte Taskleiste (temporärer Test, wieder entfernt): Mittelpunkt jedes der 14 Knöpfe geprüft, nur „blank. - 1 running window“ ergibt `true`, alle anderen und eine leere Stelle `false`; 13–15 ms je Prüfung. Einmal lieferte UI Automation direkt nach dem Öffnen/Schließen des Überlauf-Menüs nur die angehefteten Knöpfe ohne Fenster (vorübergehend); dann erkennt ein Klick das Pet nicht, der nächste schon.
- Gegenproben im Pet-Modus: Überlauf-Menü der Taskleiste geöffnet und geschlossen, während das Pet aktiv war → bleibt Pet (eine erste Fassung, die nur „Maus auf der Taskleiste“ prüfte, öffnete hier fälschlich die App; deshalb die Knopf-Prüfung). Minimieren per `WM_SYSCOMMAND`/`SC_MINIMIZE`, nicht vom eigenen Knopf → Pet wird normal minimiert.
- Verbrauch im Pet-Modus (30 s): 0,05 % CPU, 112 MB privat (wie vorher; Tray und Knopf-Prüfung kosten im Ruhezustand nichts).
- Neue Features: `tauri` `tray-icon` (bereits im Lockfile), `windows` zusätzlich `Win32_Foundation`, `Win32_System_Com`, `Win32_System_Ole`, `Win32_System_Variant`, `Win32_UI_Accessibility`. Keine neuen Befehle/Capabilities (`core:event:allow-listen` war vorhanden). `cargo clippy` ohne neue Hinweise, `cargo test` (6 bestanden), `pnpm build`, `pnpm desktop:build`.
- **Nicht automatisiert geprüft:** ein echter Mausklick auf den Taskleisten-Knopf und das Tray-Kontextmenü („Öffnen“/„Beenden“, Rechtsklick). Simulierte Maus-Eingaben sind in der Prüfumgebung wirkungslos (`SetCursorPos` meldet Erfolg, der Zeiger bewegt sich nicht). Geprüft sind die Teile: Windows-Nachrichten, Knopf-Erkennung an der echten Taskleiste und der Weg zur App (Tray, zweiter Start).

## Warnton und Programm schließen (Benutzerauftrag)

- Warnton: MP3 des Benutzers („warning alert“, Universfield/Pixabay) einmalig in WAV umgewandelt (44,1 kHz Stereo, 2,64 s, 465 KB), `src/assets/warning-alert.wav`; Rust-Test „warning_sound_is_a_playable_wav“ bestanden; über `play_alert_sound(…, "warning")` nativ abgespielt.
- Schutz: `close_program("explorer.exe")` und `close_program("blank.exe", force)` abgelehnt („Dieses Programm schließt blank. nicht“). Knopf nur bei Programmen mit sichtbarem Hauptfenster (Browser, Spiele-Client, Chat-Programme ja; deren Hintergrunddienste nein).
- Normal schließen: Zeichentabelle gestartet, Warnkarte mit ihr als Verursacher eingespielt → Knopf „Zeichentabelle schließen“ → „Wird geschlossen …“ → „Zeichentabelle geschlossen“, Programm beendet, Karte verschwindet. Erzwungen: `close_program("charmap.exe", force: true)` beendet 1 Prozess.
- Eine echte Überlast wurde weiterhin nicht erzeugt.

## Echter PC-Status, Überlast- und Akku-Warnungen, „Nicht stören“ (Benutzerauftrag)

- PC-Seite nativ: CPU, Grafikkarte, RAM und Systemlaufwerk mit Werten, jeweils mit „Meiste Last“ (Programmname aus der Dateibeschreibung); Systemübersicht mit Prozessor, Grafikkarte samt Videospeicher, installiertem RAM, Threads (per `Win32_Processor` bestätigt) und Windows-Version (Registry meldet „Windows 10“, per Build ≥ 22000 korrigiert). Abgleich: RAM belegt 0,2 GB Abweichung zum Windows-Zähler; CPU in drei Paaren innerhalb weniger Prozentpunkte zu `typeperf` (verschiedene Messfenster).
- Warnlogik in Rust per Unit-Test (`cargo test --lib pc::`, 3 bestanden): Warnung erst nach 30 s (GPU 60 s) über der Grenze, mit Verursacher, dann 30 min Pause; ein Einbruch unter die Grenze startet die Zeit neu; fehlende Messwerte warnen nie. Eine echte Überlast wurde nicht erzeugt (League-Client lief, keine Minute Volllast auf dem Benutzer-PC).
- Anzeige (Warnungen für den Test in den React-Zustand eingespielt): Karte „CPU bei 97 % · <Browser> 41 % · <Spiel> 28 %“, Klick öffnet die PC-Seite; Pet mit besorgtem Gesicht und Blase; Akku-Warnung „<Maus> · 12 % – Akku fast leer, bald laden“. „Nicht stören“ an: Pet bleibt hinten (`WS_EX_TOPMOST` nicht gesetzt), Symbol am Pet; aus: Pet kommt nach vorn, ohne Fokus. Glocke schaltet und speichert sofort; die vorherige Einstellung wurde danach wiederhergestellt.
- Nebenbei: Maus wieder kabellos → „<Maus> · Logitech-Funk · 69 %“ (Empfängerweg jetzt auch in der App bestätigt).
- Verbrauch: minimiert 0,03 % CPU (ganze App), Home sichtbar 0,25 % (Rust-Messung davon 0,05 %). Der erste Durchlauf nach dem Start ist teurer (Programmnamen werden einmalig gelesen und zwischengespeichert).
- Neue Abhängigkeit: `windows` 0.61 mit `Win32_Graphics_Dxgi` (bereits über wry im Lockfile). `cargo check`/`pnpm desktop:build` ohne Warnungen, `pnpm build`, `pnpm format:check`, `cargo fmt --check` erfolgreich.

## Pet-Modus (Benutzerauftrag)

Vorab geprüft: transparentes Fenster zusammen mit `--disable-gpu --in-process-gpu` — mit durchsichtiger Seite ist der Desktop dahinter zu sehen, die normale App sieht mit transparentem Fenster unverändert voll deckend aus. Dafür `backgroundColor` aus `tauri.conf.json` entfernt (Tauri malt ihn sonst deckend hinter die WebView).

- Pfoten-Taste → Fenster 104 × 96 CSS-px unten rechts im Arbeitsbereich des zweiten Monitors (−128,912 bis −24,1008, über der Taskleiste), kein Rahmen, keine Ecken, Hintergrund durchsichtig; Blob schläft (keiner live). Viewport 104 × 96, Zoom 1.
- Live-Meldung (für den Test über den React-Zustand eingespielt, da ein echter Live-Start nicht auslösbar war): Fenster wächst auf 240 × 158 mit fester unterer rechter Ecke, Sprechblase „Caedrel ist live!“, Blob mit Sternaugen und „!“. Hüpfen blieb aus, weil beim Benutzer „Animationen“ aus ist (gewollt). Meldung weg → wieder 104 × 96.
- Klick auf das Pet → App wieder an der alten Stelle (−1398,191, 860 × 640), Zoom passt, Rahmen/Schatten zurück, Pfoten-Taste in der Titelleiste.
- Auslastung im Pet-Modus (45 s): 0,017 % CPU, 107 MB privat; normale App danach 0,034 %, 109 MB.
- `cargo check`/`pnpm desktop:build` ohne Warnungen, `pnpm build`, `pnpm format:check` erfolgreich.
- Nachtrag (Benutzerauftrag): Meldungen bleiben 30 s (vorher 8 s), Sprechblase mit ×. Test: Pet minimiert, Meldung ausgelöst → wiederhergestellt, 240 × 158, `WS_EX_TOPMOST` gesetzt, nicht das Vordergrundfenster (kein Fokus genommen); Meldung weg → 104 × 96, nicht mehr oben.
- Nachtrag (Benutzerauftrag): Figur wählbar (Settings → Darstellung → Pet, Vorschau-Kacheln, sofort gespeichert; Blob → `pet: "blob"`, Minimal → `"minimal"` geprüft). Neue Standardfigur „Minimal“ (flach, abgerundet, schlichte Augen); der Blob bleibt wählbar. Nativ aufgenommen: Minimal schlafend (Striche + „z“) und bei Meldung (Bogen-Augen, Sprechblase).
- **Nicht automatisiert geprüft:** Ziehen des Pets mit der echten Maus, ein echter Live-Start im Pet-Modus (Ton + Blase), ein kurzer durchsichtiger Moment beim App-Start (Fenster erscheint, bevor die Seite gezeichnet ist).

## Echte Akkustände (Benutzerauftrag)

Vorab geprüft (Wegwerf-Testprogramm außerhalb der App, nur lesende Anfragen): Kein Bluetooth-Gerät gekoppelt; die Funkgeräte hängen an USB-Empfängern. Logitech LIGHTSPEED (046D:C54D): Gerät 1 (eine Logitech-Maus), Feature 0x1004 liefert Prozent direkt (17 %, entlädt), Antwort in 19 ms, Plätze 2–6 leer (HID++-Fehler 08); die Logitech-Software lief parallel. HyperX Cloud Alpha Wireless (03F0:098D, Sammlung FF43/0202, Report 0x21, 30 Byte): sendet von sich aus nichts; Anfrage 21 BB 0B → Antwort 21 BB 0B 46 0F 5A 01 = 70 %, 3,93 V, dreimal gleich, < 100 ms.

Umsetzung: `battery.rs` (neue Abhängigkeit `hidapi` 2 mit reinem Rust-Windows-Backend, nutzt dasselbe `windows-sys` 0.61), Befehl `device_batteries` (App-Manifest + Capability). Logitech: Empfänger nur Plätze 1–6, Kabelgeräte nur 0xFF (ein Kabelgerät antwortet auf jede Nummer — beim ersten Test erschien die Maus deshalb 7-mal, behoben); Gerätekennung = Unit-ID aus 0x0003, damit dieselbe Maus über Kabel und Empfänger ein Eintrag ist. Frontend: `adapters/devices.ts`, `useBatteries` (30 s, nur sichtbar und nur auf Home/Devices), Devices-Seite und Home-Karte; Mock-Geräte aus `mock.ts` entfernt; `RefreshButton` nimmt jetzt ein allgemeines Ergebnis.

- Nativ: „<Maus> · Logitech-Kabel · Lädt · 69 %“ (Maus hing zum Testzeitpunkt am Ladekabel; zwischen zwei Messungen 66 → 69 %) und „HyperX Cloud Alpha Wireless · HyperX-Funk · 70 %“; Home „Dein Setup“ gleich; Badge „Live“. Frische Abfrage 240–260 ms, gecachte < 5 ms. Aktualisieren-Knopf: dreht, Haken, Tooltip mit Uhrzeit.
- Browser-Vorschau: Devices und Home-Karte „Nur in der Desktop-App“, keine Konsolenfehler.
- `cargo check`/`pnpm desktop:build` ohne Warnungen, `pnpm build`, `pnpm format:check` erfolgreich.
- **Noch nicht geprüft** (Hardwarezustand nötig): Maus kabellos nach dem Laden (Empfängerweg funktionierte im Vortest), schlafende Maus („Nicht erreichbar“), ausgeschaltetes Headset — die App wertet fehlende oder unplausible Antworten (0 %, 0 V) als „Nicht erreichbar“; ob der Empfänger dann stattdessen einen alten Wert meldet, ist offen.

## Farbe sofort gespeichert, nur eine Instanz (Benutzerauftrag)

Die Farbe wurde schon beim Klick in localStorage geschrieben. Geprüft, ob WebView2 das verzögert und verliert: Testwert schreiben, App nach 0,3 s über das X schließen bzw. nach 0,3/8/30 s hart beenden, neu starten — in allen fünf Fällen erhalten. Gefundene Ursache: Die App ließ sich zweimal starten; beide Fenster lagen deckungsgleich auf dem zweiten Monitor, und das verdeckte Fenster schrieb bei der nächsten Änderung seine alte Farbe zurück (außerdem doppelte Live-Meldungen). Behoben mit einer Einzel-Instanz-Sperre in Rust (benannter Mutex, ohne neue Abhängigkeit).

- Zweiter und dritter Start bei minimiertem Fenster: weiterhin eine Instanz, das Fenster wird wiederhergestellt (vorher minimiert, danach 860 × 640 auf dem zweiten Monitor).
- Farbe in Settings wählen, 50 ms später über das X schließen, neu starten: Ozean bzw. Lavendel aktiv und gespeichert. Danach wieder die vorherige Farbe.
- `cargo check`/`pnpm desktop:build` ohne Warnungen.

## Ressourcen, Live-Auslastung, zweiter Monitor, Autostart (Benutzerauftrag)

Messung vorher/nachher mit Skript über blank.exe und alle WebView2-Unterprozesse (Prozessbaum, CPU-Zeit über das Intervall, 8 logische Kerne; „privat“ = PrivateMemorySize, Leerlauf auf Home):

|                 | vorher                                | nachher                               |
| --------------- | ------------------------------------- | ------------------------------------- |
| sichtbar, 60 s  | 0,57 % CPU, 236 MB privat, 7 Prozesse | 0,15 % CPU, 124 MB privat, 6 Prozesse |
| minimiert, 90 s | 0,31 % CPU, Arbeitssatz 467 MB        | 0,14 % CPU, Arbeitssatz 184 MB        |

Die Werte schwanken je nach Abfragezeitpunkten; währenddessen wurde die App teils bedient. Getestete WebView2-Varianten (je 45 s sichtbar): Standard 207 MB privat; `--disable-gpu` 135 MB; `--in-process-gpu` 172 MB; beide zusammen 104 MB (übernommen); `--disable-background-networking --disable-component-update` brachte nichts Messbares. Darstellung mit Software-Rendering geprüft (Home, Pros mit Vorschaubildern und Icons): unverändert.

- Minimiert (nativ per `ShowWindow`): `document.visibilityState` = hidden, Auslastungsanzeige pausiert (Wert nach 5 s unverändert), nach dem Wiederherstellen visible und Abfrage läuft weiter; Arbeitsspeicher danach 66 MB (Speicherziel „niedrig“ gibt Speicher frei).
- Live-Anzeige: `app_usage` (neuer Rust-Befehl, in `build.rs` und Capabilities freigegeben) liefert z. B. CPU 0,44 %, 80 MB privater Arbeitssatz, 6 Prozesse; Titelleiste „< 0,1 % · 78 MB“, alle 2 s aktualisiert. Tooltip-Text ist fest (vorher enthielt er die Werte und flackerte beim Hovern — vom Benutzer gemeldet und behoben); über 4 Aktualisierungen geprüft unverändert. Unlesbarer Speicher eines Prozesses ergibt „–“ statt einer Teilsumme.
- Settings → System: „Auslastung: CPU 0,4 % · Arbeitsspeicher 78 MB · 6 Prozesse“, Einstufung „Niedrig“ (Grenzen: < 1 % CPU und < 300 MB; < 5 % und < 600 MB „Mittel“; sonst „Hoch“). Browser-Vorschau: beide Zeilen „Nur in der Desktop-App“, kein Titelleisten-Wert, keine Konsolenfehler.
- Autostart: Schalter an → `HKCU\…\Run\blank` = Pfad der EXE in Anführungszeichen, `autostart_enabled` true; aus → Wert entfernt. Danach wieder aus (Benutzer entscheidet selbst). Nicht geprüft: tatsächlicher Start nach Windows-Anmeldung.
- Zweiter Monitor (links, X −1920…0, beide 1920 × 1080, 96 DPI): Fenster −1398,191 bis −522,840 = mittig im Arbeitsbereich, Client 860 × 640. Nicht geprüft: nur ein Monitor, gemischte Skalierung.
- `cargo check`/`pnpm desktop:build` ohne Warnungen, `pnpm build`, `pnpm format:check`, `cargo fmt --check` erfolgreich. Neue direkte Abhängigkeiten `webview2-com` 0.38 und `windows-core` 0.61 (bereits über Tauri/wry im Lockfile, gleiche Versionen).

## Lautstärke und Farbschemata (Benutzerauftrag)

**Lautstärke:** Regler „Lautstärke“ (0–100 %, Schritt 5, Standard 70) unter „Ton bei Live-Start“, deaktiviert bei ausgeschaltetem Ton. Das Verstellen spielt keinen Ton (auf Benutzerwunsch entfernt); Probehören nur über „Testen“, das die eingestellte Lautstärke nutzt. Nativ geprüft: Am Regler hängt nur noch `onChange` (React-Props im WebView), im Bundle kein `onPointerUp` mehr. Nativ: `play_alert_sound(volume: u8)` (kein neuer Befehl, Capabilities unverändert) skaliert die Samples einer Kopie mit (v/100)² und spielt synchron in einem eigenen Thread, damit der Puffer bis zum Ende lebt. Rust-Unit-Tests (`cargo test --lib sound`, 2 bestanden): Kopie bei 100 % identisch, bei 50 % Spitzenwert genau ein Viertel, bei 0 % still, andere Daten abgelehnt. Per Debug-Port aufgerufen: 0/35/100 ok, 150 wird auf 100 begrenzt, −1 abgelehnt. Die gehörte Lautstärke wurde nicht automatisiert gemessen.

**Farbschemata:** Wald (Standard, bisherige Farben), Ozean, Lavendel, Glut, Rosé, Graphit — Auswahl als runde Farbfelder in Settings → Darstellung (`aria-pressed`, Name darunter). Die Paletten in `tokens.css` sind aus Wald abgeleitet (gleiche Sättigung/Helligkeit, anderer Farbton; Graphit fast ohne Sättigung). 35 feste Grüntöne in `app.css`/`desktop.css` durch Tokens (`--accent-line`, `--accent-ink`) bzw. `color-mix()` ersetzt; übrig sind nur Kanal-Avatarfarben, Fehlerrot und ungenutzte alte Hero-Stile. „Darstellung zurücksetzen“ setzt auch das Farbschema zurück, Ton und Lautstärke bleiben.

- `pnpm build`, `pnpm format:check`, `cargo fmt --check`, `pnpm desktop:build` erfolgreich.
- Browser-Vorschau (860 × 640): kein horizontaler Überlauf, keine Konsolenfehler; Farbfeld „Ozean“ setzt `data-theme`, Akzent `#8cc2d5`, Hintergrund folgt, Auswahl nach Neuladen erhalten.
- Nativ: Home und Pros in allen sechs Schemata aufgenommen — Akzent, Sidebar-Markierung, Hintergrund-Tönung, Badges, Balken und Champion-Zeile wechseln einheitlich, Texte lesbar. Bestehende Einstellungen (ohne Lautstärke/Farbe gespeichert) werden übernommen: Wald, 70 %, Animationen aus blieb aus. Die Testauswahl wurde danach auf den vorherigen Stand zurückgesetzt. Normale EXE lädt die gebündelte Oberfläche.

## Pros: Champion-Icons, Lane und Filter (Benutzerauftrag)

Jeder Eintrag in `src/data/proStreamers.ts` hat jetzt Lane und bis zu drei Champions (Data-Dragon-IDs, meistgespielt zuerst); OTPs nur ihren Champion. Die Liste ist in `pros`, `oneTricks` und `highElo` aufgeteilt, daraus ergibt sich der Typ für den Filter. Quelle: einmalig im Browser auf dpm.lol abgelesen — für die DPM-Spieler Rolle und Top-3-Champions aus der Leaderboard-Zeile (erstes Konto bei mehreren); für die handverlesenen Spieler die bekannte Rolle und die Champions aus „Last 2 Weeks“ ihrer DPM-Pro-Seite (bei 0 Spielen oder ohne DPM-Seite keine Icons, nur die Lane: u. a. Rekkles, Odoamne, Froggen, Bjergsen, Sneaky, TFBlade). Stand 22.09.2026, Momentaufnahme; die App liest DPM.LOL nicht aus. Rollen ohne DPM-Signal (z. B. LS) sind eine Einschätzung.

Karte: Untertitel mit 18-px-Champion-Icons, Lane (Akzentfarbe) und Einordnung, z. B. „ADC · Ex-Pro“. Icons kommen von Riots CDN (`ddragon.leagueoflegends.com/cdn/16.18.1/img/champion/<id>.png`, in der CSP freigegeben, nicht im Repo); nicht ladbare Icons werden ausgeblendet. Filter-Knopf (Lucide `ListFilter`) als `filter-button icon-only` direkt links neben dem Aktualisieren-Knopf, öffnet ein Panel mit Lane (Alle/Top/Jungle/Mid/ADC/Support) und Typ (Alle/Pro/OTP/High Elo) samt Live-Anzahl je Option. Der Filter wird nicht gespeichert.

- `pnpm build`, `pnpm format:check`, `pnpm desktop:build` erfolgreich.
- Nativ über den WebView2-Debug-Port geprüft: 22 live; Filter- und Aktualisieren-Knopf beide 44 × 38 px, nebeneinander; Karten zeigen z. B. „loltyler1 | ADC · High Elo | Draven, Brand, Illaoi“, „Spear_Shot | Top · OTP Pantheon | Pantheon“, TFBlade/Aphromoo nur Lane; sichtbare Icons geladen (weiter unten lazy).
- Filter: Lane Mid → „10 von 22 live“, nur Mid-Karten; + Typ OTP → 4; Support + OTP → 0 mit Leerzustand „Kein Live-Spieler passt zum Filter“ und „Filter zurücksetzen“ → wieder 22. Knopf hervorgehoben, solange das Panel offen oder ein Filter aktiv ist (`aria-expanded`, `aria-pressed` an den Optionen).
- Twitch-Tab unverändert (1 live, 2 offline, Untertitel = Spielname). Normale EXE (ohne Debug-Port) lädt die gebündelte Oberfläche.

## Pro-Liste mit DPM.LOL erweitert (Benutzerauftrag)

Einmalige Recherche im Browser auf dpm.lol (Cookie-Einwilligung abgelehnt): SoloQ-Leaderboard Seiten 1–20 (Top 1000, alle Regionen) → 302 Spieler mit Team-Kürzel oder STREAMER-Kennzeichnung; OTP-Leaderboard → 50 Spieler; zusammen 334 Profile, auf jedem den verlinkten Twitch-Kanal abgelesen (nacheinander mit Pausen) → 226 mit Kanal. Champion-IDs der OTPs über Riots Data Dragon (16.18.1) in Namen übersetzt. Einordnung: Team-Kürzel → „Pro · TEAM“, OTP → „OTP Champion“, sonst „High Elo“. Doppelte entfernt; vorhandene Einträge behalten, außer Bwipo (DPM verlinkt `bwipolol` statt `bwipo`). Nativ geprüft: 254 Kandidaten, 12 bei Twitch nicht (mehr) vorhanden und entfernt → **242 Kanäle** (158 Pros, 20 Ex-Pros, 34 High Elo, 26 OTPs, 4 weitere). Zum Prüfzeitpunkt 25 live, davon 23 in League angezeigt (vorher 6), 2 in VALORANT ausgeblendet. Die App liest DPM.LOL nicht selbst aus; die Liste veraltet mit der Zeit (Teamwechsel, umbenannte Kanäle) und wird bei Bedarf von Hand aktualisiert.

## Pros-Tab (Benutzerauftrag)

Neuer Bereich „Pros“ (Sidebar unter LIVE): kuratierte Liste `src/data/proStreamers.ts`, Abfrage über die vorhandenen Befehle `twitch_live_streams`/`twitch_channels` in 100er-Paketen, nur Streams in League of Legends (`game_id` 21779), sortiert nach Zuschauern, keine Offline-Kanäle. Stream-Karte und Aktualisieren-Button sind jetzt gemeinsame Komponenten (`StreamCard`, `RefreshButton`) für Twitch und Pros.

Recherche der Liste: trackingthepros (Stream-Seite 504, Spielerliste ohne Twitch), deeplol (Pro-Seite 404), lolpros.gg und OP.GG (keine Stream-Listen), Leaguepedia-API (anonym dauerhaft rate-limitiert). Die Liste wurde deshalb von Hand aus bekannten Pros/Ex-Pros, High-Elo-Spielern und OTPs zusammengestellt und nativ geprüft: 42 Kandidaten, 39 existieren (`iwilldominate`, `biofrost`, `hashinshin` entfernt); Kategorie-ID 21779 = League of Legends bestätigt; zum Prüfzeitpunkt 8 Kanäle live, davon 6 in League angezeigt, 2 in VALORANT korrekt ausgeblendet; Badge „Twitch“; Twitch-Tab unverändert (1 live, 2 offline); normale EXE lädt korrekt. Rollenangaben nur, wo sie stabil sind.

## Eigener Live-Ton (Benutzerauftrag)

Der synthetische Zweiklang wurde durch die vom Benutzer gewählte Datei ersetzt: MP3 (1,78 s, Stereo, 44,1 kHz) einmalig mit einem temporären WASM-Decoder in 16-Bit-WAV umgewandelt, Spitzenpegel 0,39 (keine Übersteuerung). Rust bettet sie per `include_bytes!` ein; die Browser-Vorschau spielt dieselbe Datei. Nativ abgespielt. Hinweis: Ein Build schlug einmal fehl (EXE vermutlich noch gesperrt); ein Testskript lief danach wegen fehlender Fehlerbehandlung endlos und wurde beendet, das Skript bricht jetzt bei Fehlern ab.

## Live-Meldung mit Ton (Benutzerauftrag)

Rust: `twitch/eventsub.rs` hält eine EventSub-WebSocket-Verbindung (tokio-tungstenite, native-tls) und abonniert `stream.online` für die ersten 10 ausgewählten Kanäle (Twitch-Kostenlimit 10 pro Nutzer-Token). Bei einer Meldung werden Spiel und Titel über `/helix/channels` nachgeladen und als Ereignis an die Oberfläche geschickt. Neuverbindung bei Abbruch, fehlendem Keepalive oder `session_reconnect`; Neustart bei Änderung der überwachten Kanäle, Client-ID, Login oder Logout. `sound.rs` erzeugt einen kurzen Zweiklang im Speicher und spielt ihn über `PlaySoundW` (keine Audiodatei, unabhängig vom Windows-Soundschema). Frontend: `useGoLiveAlerts` meldet sofort bei Push (mit Spielregel-Prüfung) und erkennt außerdem Übergänge offline/anderes Spiel → live im 30-s-Abruf; höchstens eine Meldung pro Kanal in 10 Minuten; erster Abruf nach Start und neu hinzugefügte Kanäle lösen nichts aus. Meldung unten rechts (8 s, anklickbar, schließbar), Ton abschaltbar und testbar in Settings → Benachrichtigungen, dort auch Status der Sofort-Meldung.

Geprüft: Browser-Vorschau (Mock-Kanal zur Laufzeit live geschaltet): Meldung „quietquest ist live · Minecraft“, Karte erscheint, zweites Aktualisieren ohne doppelte Meldung, Meldung nach 8 s weg, Ton-Schalter gespeichert, Konsole fehlerfrei. Nativ: Sofort-Verbindung aktiv, Twitch hat alle 6 Kanäle abonniert (`connected: true, watched: 6`), Settings zeigt „6 Kanäle“; Oberfläche darf auf das Ereignis hören, aber nicht selbst senden (ACL); Ton über `play_alert_sound` abgespielt; normal gestartete EXE lädt korrekt.

Nicht geprüft: eine echte `stream.online`-Meldung (braucht einen tatsächlich live gehenden Kanal) und das Verhalten bei minimiertem Fenster.

## Fehler: EXE zeigte nur „127.0.0.1 refused to connect“

Ursache: Nach `pnpm desktop:build` wurde zur Warnungsprüfung noch `cargo build --release` ausgeführt. Das überschrieb `blank.exe` mit einem Build ohne `tauri/custom-protocol`, der den Dev-Server lädt. Diese EXE wurde auch verschickt. Behoben durch erneutes `pnpm desktop:build`; Fensterinhalt per `PrintWindow` geprüft (Home mit echten Twitch-Daten). Regel in CLAUDE.md ergänzt.

## Transparenz verworfen, Twitch-Suche entfernt (Benutzerauftrag)

`src-tauri/src/window_opacity.rs` gelöscht, Aufruf aus `lib.rs` entfernt; das Fenster ist voll deckend. Die älteren Abschnitte zur Transparenz unten beschreiben einen früheren Stand. Twitch-Suchleiste entfernt; „Nur live“, „Kanäle“ und Aktualisieren stehen rechtsbündig, Leerzustand „Gerade ist keiner deiner Kanäle live“ mit „Alle Kanäle zeigen“. Nativ geprüft: keine Suchleiste mehr, „Nur live“ blendet Offline-Kanäle aus und wieder ein.

## Redesign in Richtung DPM (Benutzerauftrag)

Nur Aufbau und Wirkung übernommen, keine Logos/Bilder/Farben: Farbpalette dunkler (Tokens, gleiche Namen), grüner Schimmer unten links; Sidebar ohne Rahmen mit Version, Abschnitten „Übersicht/Live/System“, aktivem Balken und Profilblock (eigenes Twitch-Profilbild über `fetchChannels`, Klick → Settings); Inhalt in eingerahmtem Panel; Seitenkopf mit Symbol-Kachel; Mock/Twitch-Badge in der Titelleiste; Leerzustände mit Symbol-Kachel; Segoe UI Variable als Schrift (Fallback Segoe UI). Seiten unverändert.

Geprüft (nativ mit echten Daten, WebView-Aufnahmen): alle sechs Seiten bei 860 × 640; Home, League, Devices, PC ohne Überlauf, Twitch/Settings scrollen; Sidebar passt ohne Überlauf. Funktionen: Profilblock → Settings, League-Auswahl, Twitch-Suche mit Leerzustand und Zurücksetzen, „Nur live“, Kanal-Panel, Aktualisieren („Aktualisiert“), Fensterknöpfe und Badge in der Titelleiste. Browser-Vorschau 720 × 540: schmale Sidebar blendet Beschriftungen/Version/Profiltext aus, kein Überlauf; „Kompakte Ansicht“ bleibt nach Neuladen gespeichert; Konsole fehlerfrei.

## Rückmeldung beim Aktualisieren (Benutzerauftrag)

Auf dem Prüfrechner sind Windows-Animationen aus (`SPI_GETCLIENTAREAANIMATION` = false, WebView meldet `prefers-reduced-motion: reduce`), daher war das Drehen nie sichtbar. `RefreshButton`: mindestens 0,7 s Ladezustand (Symbol gedimmt, mit Animationen zusätzlich drehend), danach 1,6 s grüner Haken bzw. rotes Ausrufezeichen bei Fehler (Symbol- und Farbwechsel, funktioniert ohne Animation), Screenreader-Ansage „Aktualisiert“. Nativ gemessen: 50/400 ms Laden → 900/1500 ms Haken → 2700 ms wieder normal.

## Aktualisieren lädt alles (Benutzerauftrag)

Der Button lädt jetzt Streams (Titel, Spiel, Zuschauer, Vorschaubild) und Kanaldaten (Anzeigename, Profilbild) aller ausgewählten Kanäle. Kanaldaten kommen gebündelt über den neuen Befehl `twitch_channels` (eine `/helix/users`-Anfrage für bis zu 100 Kanäle); das einmalige Nachladen fehlender Profilbilder nutzt denselben Weg. Nativ geprüft: `twitch_channels` liefert nur gültige, existierende Kanäle (ungültiger und unbekannter Name übergangen); Klick → Drehen ca. 0,4 s, Stand aktualisiert, neue Vorschaubild-Adresse, Profilbild aktuell. Grenze: Twitch selbst übernimmt Titel-/Spieländerungen in der API teils mit etwas Verzögerung, Vorschaubilder erneuert Twitch etwa alle 5 Minuten.

## Stream per Klick öffnen (Benutzerauftrag)

Live-Karten, Offline-Zeilen und Home-Einträge öffnen den Kanal im Standardbrowser (`twitch.tv/<login>`). Rust-Befehl `twitch_open_channel` baut die URL selbst aus einem geprüften Login (keine freien URLs aus dem Frontend), per App-Manifest und Capability freigegeben. Browser-Vorschau/Mock: nicht klickbar (fiktive Kanäle). Nativ geprüft: `../evil`, `https://example.com`, `a b` → „Ungültiger Kanal“; Klickfläche liegt über der ganzen Karte bzw. Zeile, Tastatur-Fokus sichtbar. Das tatsächliche Öffnen eines gültigen Kanals wurde nicht automatisiert ausgelöst (würde einen Browser-Tab beim Benutzer öffnen).

## Aktualisieren-Button (Benutzerauftrag)

Button in der Twitch-Toolbar: fragt Live-Status sofort ab (startet den 60-s-Takt neu) und hängt einen Zeitstempel an die Vorschaubild-Adresse, damit das Bild frisch geladen wird (automatisch sonst höchstens alle 5 Minuten, `t`-Parameter aus Rust). Tooltip zeigt den Stand. Nativ mit echten Daten geprüft: Symbol dreht sich und Button ist gesperrt während der Abfrage, danach neues Bild (`…?t=5967011&r=…` geladen, sichtbar andere Szene) und aktualisierte Zuschauerzahl. Drehung entfällt bei reduzierter Bewegung.

## Twitch-Karten neu gestaltet (Benutzerauftrag)

Erste echte Daten (loltyler1 live) zeigten ein beschnittenes Vorschaubild mit Spielname darüber, einen vierzeiligen Titel, Initialen statt Profilbild und die nutzlose Angabe „Alle Spiele“. Neu: volles 16:9-Vorschaubild bündig in der Karte (Ursache des Randes: `desktop.css` überschrieb `.stream-card { padding: 0 }`), Plaketten „Live“ und Zuschauerzahl, echtes Profilbild (aus `/helix/users`, beim Kanal gespeichert, ältere Auswahl einmalig nachgeladen, Rückfall auf Initialen), einzeiliger Titel mit Tooltip, Spiel darunter. Live-Kanäle nach Zuschauern sortiert; Offline-Kanäle als kompakte Zeile statt großer leerer Karten. Im nativen Fenster mit echten Daten (Vorschaubild 440 × 248, Profilbild geladen) und in der Browser-Vorschau mit Mock-Daten geprüft, Konsole fehlerfrei.

## Festes Seitenverhältnis (Benutzerauftrag)

`src-tauri/src/window_aspect.rs`: Subclass-Hook für `WM_SIZING` (gezogene Kante führt), `WM_WINDOWPOSCHANGING` (alle übrigen Größenänderungen, Minimieren ausgenommen) und `WM_GETMINMAXINFO` (DPI-genaue Grenzen inkl. unsichtbarer Ränder, ersetzt tao-Werte). WebView-Zoom = Client-Breite / 860. Im nativen Fenster (96 DPI) gemessen:

- Start 860 × 640, CSS-Viewport 860 × 640, Zoom 1,0.
- `SetWindowPos` 1400 × 800 → 1000 × 744 (Zoom 1,163); 400 × 300 → 720 × 536 (0,837); 950 × 900 → 934 × 695 (1,086). CSS-Viewport jeweils exakt 860 × 640.
- `WM_SIZING` rechter Rand +57 px → Höhe folgt (Verhältnis 1,3446); oberer Rand −40 px → Breite folgt, Unterkante bleibt (1,3441); Soll 1,3438.
- Grenzen jetzt exakt: Min-Track 736 × 545 (Client 720 × 536), Max-Track 1016 × 753 (Client 1000 × 744). Die frühere tao-Abweichung (704 × 511 bis 984 × 751) ist behoben.
- WebView-Aufnahmen bei 1000 × 744 und 720 × 536 zeigen identisches, scharf skaliertes Layout.
- Layout bei 860 × 640: Home, League (Build/Runen/Skill Order jetzt nebeneinander), Devices und PC (Symbol in der Kartenecke, Systemübersicht zweispaltig) füllen die Fläche exakt ohne Scrollen (vorher PC 184 px, League 35 px Überlauf); Twitch und Settings scrollen. Home zeigt höchstens 3 Live-Kanäle plus „+N weitere live“.
- Nicht geprüft: echtes Ziehen mit der Maus (nur per Nachricht simuliert), Aero Snap, andere DPI-Stufen.

## Echte Twitch-Anbindung (Benutzerauftrag)

Rust-Modul `src-tauri/src/twitch/` (reqwest 0.13 mit native-tls/Schannel, keyring 3 mit Windows-Backend, serde, tokio „time“). Elf Befehle, per App-Manifest in `build.rs` und `capabilities/default.json` einzeln freigegeben. Release-Build und `cargo fmt --check` ohne Warnungen.

Im nativen Fenster (per WebView2-Debug-Port nur für den Test gesteuert):

- Ohne Client-ID: `twitch_account` → nicht konfiguriert; Home „— Streams online · Nicht mit Twitch verbunden“; Twitch-Seite zeigt nur die Konto-Karte mit Client-ID-Feld; Badge „Twitch“ statt „Mock“.
- Befehle ohne Konfiguration liefern `{ kind: "not-configured" }` (typisierte Fehler kommen im Frontend an).
- Client-ID gespeichert (`%APPDATA%\com.blank.desktop\twitch.json`), „Mit Twitch verbinden“ → echte HTTPS-Anfrage an `id.twitch.tv`; Twitch lehnt die absichtlich ungültige Test-ID mit „invalid client“ ab, die Karte zeigt die Meldung (jetzt übersetzt). „Client-ID ändern“ öffnet das Feld wieder. Settings zeigt die Twitch-Karte, „Verbindungen“ nur noch geplante Punkte.
- Test-Konfiguration danach gelöscht; kein Eintrag `blank.twitch` in der Anmeldeinformationsverwaltung.
- Erste echte Nutzung: Kanalname („loltyler1“) statt Client-ID eingetragen → Twitch „invalid client“. Nachgebessert: kurze Einrichtungsschritte im Client-ID-Feld, Eingaben unter 20 Zeichen werden im Frontend und in Rust abgelehnt („Das ist keine Client-ID, sondern z. B. ein Kanalname …“), bei „invalid client“ öffnet sich das Feld wieder. Im nativen Fenster geprüft.
- Browser-Vorschau: weiter Mock-Adapter ohne Konto-Karte; neue Spielsuche (Fokus, Treffer, „Keine Treffer“), Regeländerung blendet sofort aus; Konsole fehlerfrei.

**Nicht geprüft (braucht deine Client-ID und deinen Login):** Code-Anzeige und Bestätigung im Browser, Token-Speicherung, Validierung/Refresh, echte Kanalsuche, Live-Streams mit Vorschaubildern, Trennen. Ob Twitch den Device Flow mit leerer Scope-Liste akzeptiert, ist nicht dokumentiert und muss beim ersten Login geprüft werden.

## Twitch-Kanalauswahl mit Spielfiltern (Mock, Benutzerauftrag)

Typisierter Adapter (`src/adapters/twitch.ts`) mit Mock-Umsetzung; Zustände Laden, Fehler, veraltete Daten, unbekannter Status und Offline sind modelliert (unbekannt wird nie als offline angezeigt). Kein Netzwerk, kein Login. Browser-Vorschau bei 860 × 640 und 720 × 520, Konsole fehlerfrei:

- Standardauswahl: Home „02 Streams online“ (forestbyte, pixelpilot); nightwave (Regel „nur League“, spielt Just Chatting) ausgeblendet, Kanalverwaltung zeigt „ausgeblendet“.
- Spiel zu nightwave hinzugefügt → erscheint, Live-Zähler 3; Chip entfernt → „Alle Spiele“.
- Kanal hinzufügen: emberline gefunden und live (Minecraft); unbekannter Name → „nicht gefunden (Mock-Daten)“; „ ForestByte “ → „bereits ausgewählt“ (Groß-/Kleinschreibung und Leerzeichen normalisiert).
- Auswahl bleibt nach Neuladen erhalten; Home danach „04 Streams online“.
- Suche „MINECRAFT“ → emberline; „zzz“ → Leerzustand, „Filter zurücksetzen“ funktioniert; „Nur live“ blendet Offline-Kanäle aus.
- Leerzustände „Deine Kanäle spielen gerade andere Spiele“ und „Keine Kanäle ausgewählt“ geprüft.
- Toolbar bleibt bei 720 px einzeilig, kein horizontaler Überlauf.
- Enter im Kanalfeld konnte das Testwerkzeug nicht auslösen (auch nicht bei einem neutralen Testformular); Absenden per Button und `requestSubmit()` geprüft. Bitte Enter einmal manuell prüfen.

## Behobene Fehler

1. **Transparenz wirkungslos.** tao schreibt `GWL_EXSTYLE` bei jeder Flag-Änderung (hier `window.show()`) aus seinen eigenen Flags neu und entfernt dabei `WS_EX_LAYERED`. Das Fenster war dadurch vollständig deckend, obwohl `apply` fehlerfrei durchlief. `window_opacity.rs` installiert nun zusätzlich einen `SetWindowSubclass`-Hook, der bei `WM_STYLECHANGING` das Layered-Bit beibehält. Das Fenster wird weiterhin erst mit angewendeter Deckkraft eingeblendet.
2. **„bblank.“ bei schmalem Fenster.** Unter 780 px Breite (im Desktopfenster 720–780 px) überschrieb `desktop.css` mit `.brand { font-size: 27px }` die kompakte Logo-Regel aus `app.css`; „b“ und „blank.“ erschienen gemeinsam und überlagerten die Seitenüberschrift. `desktop.css` setzt im kompakten Breakpoint jetzt ebenfalls `font-size: 0`, sodass das vorgesehene „b.“ erscheint.

## Nicht geprüft / Grenzen

- Nur 96 DPI (100 %) geprüft; Skalierung 125/150 % und mehrere Monitore noch offen.
- Maximieren per Win+Pfeil-oben und Andocken am oberen Bildschirmrand nicht automatisiert geprüft (keine Eingaben in die Benutzersitzung eingespeist); manuell nachprüfen.
- `pnpm desktop:dev` nicht separat geprüft; Release-Build und Browser-Vorschau decken beide Pfade ab.
- Keine Installer, Signierung, Updates, Autostart. Es gibt absichtlich keine externen APIs, Netzwerkanfragen aus der App, Hardware-Abfragen, Authentifizierung oder echte Spieldaten. Kein vollständiges Accessibility-Audit.

## Frühere Frontend-Prüfung (weiterhin gültig)

League-Auswahl aktualisiert den Demo-Text; Devices ohne erfundenen Akkustand beim Offline-Controller; Settings-Schalter werden persistiert und lassen sich zurücksetzen. Diese Logik wurde in dieser Runde nicht verändert.

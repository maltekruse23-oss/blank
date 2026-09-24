# blank.

Kleine Windows-App für nebenbei: zeigt, wer auf Twitch live ist (mit Sofort-Meldung), welche League-Pros gerade streamen, spielt SoundCloud-Mixes, zeigt die Akkustände von Maus und Headset und die Auslastung deines PCs und räumt auf Wunsch den RAM auf. Zwei Designs zur Wahl, und auf Knopfdruck wird sie zu einem kleinen Pet auf dem Desktop.

## Download

### ➜ [blank.exe herunterladen](https://github.com/maltekruse23-oss/blank/releases/latest/download/blank.exe)

1. Auf den Link oben klicken. `blank.exe` landet in deinem Downloads-Ordner.
2. `blank.exe` doppelklicken. Keine Installation nötig.
3. Erscheint „Der Computer wurde durch Windows geschützt“: auf **Weitere Informationen** und dann auf **Trotzdem ausführen** klicken. (Die App ist nicht signiert; das kommt nur beim ersten Start.)

Mehr brauchst du nicht. Die Ordner auf dieser Seite und die „Source code“-Dateien im Release sind nur der Quellcode.

**Gut zu wissen**

- **Neue Version:** blank. über das Symbol unten rechts in der Taskleiste beenden (Rechtsklick → Beenden), dann den Link oben erneut benutzen und die alte `blank.exe` ersetzen. Einstellungen bleiben erhalten.
- **Fester Platz:** Leg `blank.exe` am besten in einen eigenen Ordner (z. B. `Dokumentelank`), bevor du in den Settings „Mit Windows starten“ einschaltest.
- **Anderer PC:** Einstellungen dort unter Settings → Übertragen → Exportieren speichern, hier unter Settings → Übertragen → Importieren übernehmen. Twitch danach einmal neu verbinden.
- **Twitch:** braucht einmalig eine eigene, kostenlose Client-ID; Anleitung unten unter „Twitch einrichten“.
- Voraussetzung: Windows 10 oder 11 (64 Bit). Alle Versionen: [Releases](https://github.com/maltekruse23-oss/blank/releases).

---

# Für Entwickler

Tauri 2, React, TypeScript und Vite. In der Desktop-App sind alle angezeigten Daten echt: **Twitch** über die offizielle Helix-API (Login nötig), Akkustände direkt von den Geräten (nur lesend), PC-Werte von Windows, Musik über SoundClouds offiziellen Player. Die Browser-Vorschau zeigt für Twitch fiktive Mock-Daten; Akkus und PC-Werte gibt es dort nicht. Kein Scraping.

**Neue Version veröffentlichen:** Versionsnummer in `package.json`, `src-tauri/Cargo.toml` und `src-tauri/tauri.conf.json` anheben, committen, Tag `vX.Y.Z` pushen. GitHub Actions (`.github/workflows/release.yml`) prüft Formatierung und Rust-Tests, baut mit `pnpm desktop:build` und hängt `blank.exe` an das Release (Text aus `.github/release-notes.md`); der Download-Link oben zeigt immer auf das neueste Release.

## Starten

Voraussetzungen: Node.js 22.12+ und pnpm 11. Für die Desktop-App zusätzlich Rust mit MSVC-Toolchain, Microsoft C++ Build Tools (Desktopentwicklung mit C++) und WebView2. Offizielle Anleitung: https://v2.tauri.app/start/prerequisites/

Einrichtung per winget (so auf dem Entwicklungsrechner geprüft):

```powershell
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --add Microsoft.VisualStudio.Component.Windows11SDK.26100"
npm install -g pnpm@11.25.0
```

Rust über `rustup-init.exe` von https://rustup.rs (Standard-Toolchain `stable-x86_64-pc-windows-msvc`). Die Installation über winget (`Rustlang.Rustup`) brach auf dem Prüfrechner ab. Danach eine neue Shell öffnen, damit `cargo` im PATH ist.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Browser-Vorschau: http://127.0.0.1:1420

```powershell
pnpm build           # TypeScript-Prüfung und Produktionsbuild
pnpm format:check    # Einheitliche Formatierung prüfen
pnpm desktop:dev     # Tauri-Fenster mit Entwicklungsserver
pnpm desktop:build   # Windows-EXE, noch kein Installer
```

Die EXE entsteht unter `src-tauri/target/release/blank.exe`. Der sichtbare App- und Fenstertitel lautet **blank.**. Das Fenster ist rahmenlos: eine eigene Titelleiste im App-Design übernimmt Ziehen, Minimieren und Schließen; Größenänderung erfolgt über die unsichtbaren Fensterränder. Installer, Signierung und Updates sind noch nicht eingerichtet.

## Bereiche

- **Home:** Übersicht mit Verknüpfungen: links „Twitch Live“ (bis zu 6 Live-Kanäle), rechts „Dein Setup“ und „PC-Status“; in der Desktop-App alles echte Daten (Badge „Live“).
- **Twitch:** eigene Kanalauswahl („Kanäle“). Pro Kanal „Alle Spiele“ oder nur bestimmte Spiele (Spielsuche); ist ein Kanal mit einem anderen Spiel live, wird er ausgeblendet (die Kanalverwaltung nennt den Grund). Live-Filter und Leerzustände (keine Suchleiste). Live-Karten mit offiziellem 16:9-Vorschaubild, Profilbild, Titel und Spiel (nach Zuschauern sortiert); Offline-Kanäle als kompakte Zeile. Desktop-App: echte Daten, alle 60 s aktualisiert (Vorschaubilder höchstens alle 5 Minuten, so oft erneuert Twitch sie); der Aktualisieren-Button lädt sofort alles neu: Titel, Spiel, Zuschauer, Vorschaubild, Anzeigename und Profilbild. Ein Klick auf Karte, Offline-Zeile oder Home-Eintrag öffnet den Kanal auf twitch.tv im Standardbrowser. **Live-Meldung:** Geht ein ausgewählter Kanal live (bzw. wechselt zu einem ausgewählten Spiel), erscheint unten rechts eine Meldung (Klick öffnet den Stream) und ein kurzer, selbst erzeugter Ton; abschaltbar unter Settings → Benachrichtigungen. Die ersten 10 Kanäle meldet Twitch sofort per EventSub-WebSocket (Twitch-Kostenlimit), alle übrigen und Spielwechsel erkennt der Abruf alle 30 s. Browser-Vorschau: Mock-Daten, nicht klickbar.
- **Twitch einrichten (einmalig):** In der [Twitch Developer Console](https://dev.twitch.tv/console/apps) eine Anwendung registrieren: OAuth-Redirect `http://localhost`, Kategorie beliebig, **Client-Typ „Öffentlich“ (Public)**. Die Client-ID in blank. unter Twitch oder Settings eintragen, „Mit Twitch verbinden“ und den Code im Browser bestätigen. Es werden keine Berechtigungen (Scopes) angefragt; ein Client Secret wird nicht benötigt.
- **Pros:** alle gerade live League of Legends spielenden Pros, Ex-Pros, High-Elo-Spieler und OTPs aus einer kuratierten Liste (`src/data/proStreamers.ts`, 242 Twitch-Kanäle: handverlesene Pros/Ex-Pros/High-Elo/OTPs plus Spieler aus dem DPM.LOL-Leaderboard, per Twitch-API geprüft), nach Zuschauern sortiert. Jede Karte zeigt kleine Icons der drei meistgespielten Champions (bei OTPs nur deren Champion), die Lane und die Einordnung (z. B. „Mid · Pro · FNC“, „Top · OTP Riven“, „ADC · High Elo“); Lane und Champions sind eine Momentaufnahme aus DPM.LOL vom 22.09.2026. Filter-Knopf neben dem Aktualisieren-Knopf: Lane (Top/Jungle/Mid/ADC/Support) und Typ (Pro/OTP/High Elo) mit Live-Anzahl je Option, nicht gespeichert. Keine Offline-Kanäle, keine manuelle Eingabe; Streams anderer Spiele werden ausgeblendet. Abruf alle 60 s, nur solange der Tab offen ist, plus Aktualisieren-Button. Die Liste wird von Hand gepflegt; Seiten wie DPM.LOL, trackingthepros oder Leaguepedia werden nicht zur Laufzeit ausgelesen. Mit 242 Kanälen fragt der Tab 3 Pakete à 100 pro Minute ab.
- **Musik:** SoundCloud-Accounts oder Playlists hinterlegen (Profil-Link, Name oder Playlist-Link `…/sets/…`; geprüft über SoundClouds offizielles oEmbed, ohne Schlüssel und Konto) und per „Mix“ deren Tracks in zufälliger Reihenfolge abspielen. Ein Profil spielt nur eigene Uploads; wer nur Playlists anlegt (z. B. Sammlungen fremder Tracks), wird über den Playlist-Link hinzugefügt. Pause/Weiter, nächster Zufallstrack, Stopp, Position (springen möglich) und eigene Lautstärke. Es läuft SoundClouds offizieller eingebetteter Player, unsichtbar; die Seite zeigt Track, Uploader und „SoundCloud“ mit Links auf soundcloud.com (verlangen SoundClouds Nutzungsbedingungen). Die Musik spielt über Seitenwechsel, minimiert und im Pet-Modus weiter. Der Player existiert nur, solange ein Mix läuft: vorher und nach „Stopp“ kostet die Seite nichts. Gespeichert unter `blank.music.v1` (Accounts, Lautstärke). Tracks, die SoundCloud nicht zum Einbetten freigibt, werden übersprungen; Go+-Tracks großer Labels spielt der Player nur als Vorschau.
- **Devices:** echte Akkustände der angeschlossenen Funkgeräte (nur Desktop-App): Name, Art, Verbindung, Prozent, „Lädt“/„Voll geladen“; unter 20 % rot. Unterstützt: Logitech-Geräte am Empfänger oder Kabel (HID++ 2.0) und HyperX Cloud Alpha Wireless. Abfrage alle 30 s, solange Home oder Devices offen und das Fenster sichtbar ist, plus Aktualisieren-Knopf; bereits gesehene, aber gerade stumme Geräte (Maus schläft) stehen als „Nicht erreichbar“ da, nie mit 0 %. Die „Dein Setup“-Karte auf Home zeigt dieselben Werte; Titelleisten-Badge „Live“.
- **PC:** echte Werte von Windows (nur Desktop-App): CPU-, Grafikkarten- und Arbeitsspeicher-Auslastung, belegter Platz auf dem Systemlaufwerk, jeweils mit dem Programm, das am meisten nutzt; Systemübersicht mit Prozessor, Grafikkarte, installiertem RAM und Windows-Version. Temperaturen nicht (bräuchten Zusatztreiber). **RAM bereinigen** (Knopf „Bereinigen“ in der RAM-Karte) wie Mem Reduct: leert die Arbeitsspeicher aller Programme, den System-Dateicache, die Liste geänderter Seiten und die Standby-Liste ohne Priorität, danach „x GB freigegeben“. Windows erlaubt das nur mit Administratorrechten; deshalb fragt Windows bei jedem Klick („Änderungen zulassen?“), und nur für diesen Vorgang läuft kurz `blank.exe --clean-memory` mit Adminrechten. Nie automatisch. Programme laden danach Benötigtes von der Festplatte nach, das kann kurz ruckeln. Die Home-Karte „PC-Status“ zeigt dieselben Werte; Titelleisten-Badge „Live“.
- **Settings:** Design „Klassisch“ oder „Arena“ (siehe „Gestaltung“), Farbschema für Klassisch (Wald, Ozean, Lavendel, Glut, Rosé, Graphit; Standard Wald), kompakte Ansicht, Animationseinstellung und Reset der Darstellung; Live-Ton an/aus mit Lautstärke-Regler (0–100 %; Probehören nur über „Testen“). Karte „System“: „Mit Windows starten“ (eigener Eintrag unter `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, nur Desktop-App; ein im Task-Manager deaktivierter Eintrag zählt als aus) und die Auslastung (CPU, Arbeitsspeicher, Prozesse, grobe Einstufung). Speicherung lokal unter `blank.preferences.v1`. Twitch-Konto (Client-ID, verbinden, trennen) nur in der Desktop-App. **Übertragen:** „Exportieren“ schreibt alle Einstellungen in eine Datei `blank-einstellungen.json` im Downloads-Ordner (Explorer zeigt sie an): Darstellung, Pet, Benachrichtigungen, alle Musik-Accounts und Playlists mit Lautstärke, alle Twitch-Kanäle mit Spielregeln und die Twitch-Client-ID. „Importieren“ öffnet den Windows-Dateidialog, prüft die Datei, zeigt ihren Inhalt und ersetzt die Einstellungen erst nach „Übernehmen“. Nie enthalten: der Twitch-Login (Token bleibt in der Windows-Anmeldeinformationsverwaltung, auf einem neuen PC einmal verbinden) und der Autostart (nur per Schalter). Geplante Integrationen sind keine aktiven Bedienelemente.

## Architektur

```text
src/
  adapters/twitch.ts      Twitch-Schnittstelle: Typen, Fehlerarten, Konto-API, Spielregel
  adapters/twitchHelix.ts Desktop: ruft nur die freigegebenen Rust-Befehle auf
  adapters/twitchMock.ts  Browser-Vorschau: Daten aus data/mock.ts, Auswahl in localStorage
  adapters/twitchSource.ts Wählt Helix (Tauri) oder Mock (Browser)
  app/App.tsx             Navigation, App-Shell, lokale UI-Einstellungen
  app/TitleBar.tsx        Eigene Titelleiste (Ziehfläche, Live-Auslastung, Status-Badge, Minimieren, Schließen)
  app/useAppUsage.ts      Liest die Auslastung alle 2 s, nur bei sichtbarem Fenster
  app/SidebarAccount.tsx  Profilblock unten in der Sidebar
  components/ui.tsx       Card, Badge, Meter, DeviceIcon
  platform/window.ts      Isolierter Adapter für native Fensteraufrufe
  platform/system.ts      Adapter für Auslastung und Autostart (nur Desktop-App)
  adapters/devices.ts     Adapter für die Akkustände (nur Desktop-App)
  adapters/pc.ts          Adapter für PC-Status und Warnungs-Ereignisse (nur Desktop-App)
  adapters/soundcloud.ts  SoundCloud: Profilprüfung (oEmbed), Steuerung des eingebetteten Players per postMessage
  app/useWarnings.ts      Akku- und Überlast-Warnungen für Karten und Pet
  data/mock.ts            Zentrale, statische Beispieldaten
  features/
    home/ twitch/ pros/ music/ devices/ pc/ settings/ pet/
  features/settings/preferences.ts   Einstellungen: Typ, Standardwerte, Prüfung (gespeichert und importiert)
  features/settings/settingsFile.ts  Übertragen: Dateiformat und strenge Prüfung beim Import
  styles/tokens.css       Zentrale Farben, Abstände, Radien und Schrift
  styles/app.css          Layout, Komponenten und responsive Regeln
src-tauri/
  src/twitch/             Helix-Zugriff, Device Code Login, Token im Windows-Tresor,
                          EventSub-WebSocket für sofortige Live-Meldungen (eventsub.rs)
  src/sound.rs            Live- und Warnton (src/assets/*.wav, eingebettet) über PlaySoundW, Lautstärke durch Skalieren einer Kopie
  src/window_aspect.rs    Festes Seitenverhältnis + Inhalts-Zoom
  src/monitor.rs          Startposition: mittig auf dem zweiten Monitor
  src/background.rs       Minimiert: WebView2 unsichtbar + Speicherziel „niedrig“
  src/usage.rs            Eigene Auslastung (blank.exe + WebView2-Prozesse)
  src/autostart.rs        „Mit Windows starten“ (Run-Eintrag des Benutzers)
  src/battery.rs          Akkustände: Logitech HID++ und HyperX, nur lesende Anfragen
  src/single_instance.rs  Nur eine laufende App; ein zweiter Start holt die ganze App nach vorn
  src/pet.rs              Pet-Modus: Fenster klein, rahmenlos, transparent und zurück; Taskleisten-Klick → App
  src/taskbar.rs          Erkennt den eigenen Taskleisten-Knopf unter der Maus (UI Automation, nur lesend)
  src/tray.rs             Symbol im Infobereich (Pfeil unten rechts): Klick/„Öffnen“ → App, „Beenden“
  src/pc.rs               PC-Status, Programme mit der meisten Last, Überlast- und Akku-Warnungen, Programm schließen
  src/soundcloud.rs       Öffnet soundcloud.com-Links (Track, Uploader) im Browser, sonst nichts
  src/settings_file.rs    Export: ergänzt Twitch-Kanäle und Client-ID, schreibt nach Downloads
  src/memory.rs           RAM bereinigen wie Mem Reduct (eigener Start mit Adminrechten, nur auf Klick)
  build.rs                App-Manifest: nur freigegebene Befehle aufrufbar
  capabilities/           Fenster ziehen/minimieren/schließen, Ereignisse + einzeln freigegebene eigene Befehle
  tauri.conf.json         Fenster, Build-Verknüpfung und CSP
```

Die Hauptbereiche (Home, Twitch, Pros, Devices, PC, Settings) sind eigene Komponenten. Für dieses Grundgerüst reicht eine typisierte Navigation ohne Router. React-Zustand bleibt lokal; nur Anzeigepräferenzen werden gespeichert. Ein defekter oder gesperrter Speicher führt nicht zum Absturz. Native Fensteraufrufe laufen ausschließlich über `platform/window.ts` (`@tauri-apps/api`) und erst bei Benutzereingabe; die Browser-Vorschau blendet die Fensterknöpfe aus und benötigt keine Tauri-Laufzeit.

## Gestaltung & Zugänglichkeit

**Zwei Designs** (Settings → Darstellung → Design, sofort gespeichert, `data-design` auf `<html>`): „Klassisch“ mit den Farbschemata und „Arena“ im Stil von Gaming-Begleit-Apps: tiefes Blau-Schwarz, Indigo als Akzent (eigene Farben, das Farbschema gilt dort nicht), großer fetter Seitentitel mit Trennstrich und Kurzzeile, Kartentitel in Großbuchstaben mit Akzentbalken, Symbole der PC-Werte in farbigen Kacheln (Tokens `--tone-1…4`), gefüllte Schalter, Leisten mit Verlauf. Gleiches Layout, nur andere Optik: Farben in `tokens.css`, Aussehen in `src/styles/arena.css`. Keine fremden Logos oder Bilder.

Live-Ton: „new notification 07“ von Universfield (Pixabay), vom Benutzer ausgewählt, einmalig von MP3 in WAV umgewandelt (`src/assets/live-alert.wav`), weil `PlaySoundW` nur WAV abspielt. `PlaySoundW` kennt keine Lautstärke; `play_alert_sound(volume)` multipliziert die 16-Bit-Samples einer Kopie mit (Lautstärke/100)² und spielt sie in einem eigenen Thread (Browser-Vorschau: `audio.volume` mit derselben Kurve).

Eigenständige Gestaltung mit dunklen Grün-/Schwarztönen (Standard; weitere Farbschemata in den Settings: `data-theme` auf `<html>`, Paletten in `src/styles/tokens.css` mit gleicher Helligkeit/Sättigung und anderem Farbton, abgeleitete Töne per `color-mix()`), Sidebar, abgerundeten Cards und dezenten Akzenten. Aufbau lose an Desktop-Apps wie DPM angelehnt (keine Assets übernommen): Sidebar auf dunklem Rahmen mit Abschnitten (Übersicht, Live, System), aktivem Balken und Profilblock (Twitch-Konto, öffnet Settings); Inhalt in einem eingerahmten Panel mit Seitenkopf (Symbol-Kachel + Titel); Status-Badge in der Titelleiste; Leerzustände mit Symbol-Kachel. Keine kopierten Referenz-Logos oder Produktbilder. Symbole: Lucide (ISC-Lizenz); Schrift: lokal verfügbare Segoe UI/Systemschrift. `src-tauri/icons/icon.ico` ist ein eigenes, neutrales Icon (weißes „b.“ auf fast schwarzer, abgerundeter Kachel, Rand durchsichtig), unabhängig von den Farbschemata und auf heller wie dunkler Taskleiste lesbar; Quelle `src-tauri/icons/icon.svg`. Neu erzeugen: `pnpm tauri icon src-tauri/icons/icon.svg -o <Temp-Ordner>` und nur `icon.ico` übernehmen; danach `src-tauri/build.rs` berühren (Änderungsdatum), sonst bettet der Build weiter das alte Icon in die EXE ein. Es werden keine Fonts aus dem Netz geladen; Bilder aus dem Netz nur als Inhalt: Twitch-Vorschauen/Profilbilder und im Pros-Tab Champion-Icons von Riots Data Dragon (nicht im Repo gebündelt).

Tastaturbedienbare Navigation, sichtbare Fokusmarkierung, beschriftete Formulare, semantische Schalter, ein Sprunglink und Beachtung von `prefers-reduced-motion` sind enthalten. Das Badge „Mock“ in der Titelleiste erscheint, solange Daten simuliert sind (Browser-Vorschau); in der Desktop-App ist nach dem Entfernen des League-Platzhalters nichts mehr simuliert. Kleinere Browserfenster erhalten eine kompakte Sidebar; im Desktopfenster greift sie nie, weil der Inhalt dort immer 860 CSS-Pixel breit ist.

## Weiterentwickeln / Übergabe an Claude Code

Den ganzen Projektordner einschließlich `CLAUDE.md`, `pnpm-lock.yaml` und dieser README kopieren oder in ein eigenes Git-Repository übernehmen. `node_modules`, `dist` und `src-tauri/target` werden nicht mitgegeben. Anschließend `pnpm install --frozen-lockfile` ausführen. Für Twitch-Echtdaten wird eine eigene Client-ID benötigt (siehe oben); sonst sind keine Schlüssel oder Accounts notwendig.

**Twitch-Anbindung:** Login per Device Code Flow (Public Client, kein Client Secret, keine Scopes). Der OAuth-Token liegt nur in der Windows-Anmeldeinformationsverwaltung (Eintrag `blank.twitch`), Client-ID und Kanalauswahl in `%APPDATA%\com.blank.desktop\twitch.json`. Alle Anfragen laufen in Rust (reqwest mit Windows-Schannel); das Frontend erhält nie einen Token. Token-Validierung beim Start und stündlich (Twitch-Vorgabe), automatischer Refresh, bei Ablauf „Nicht verbunden“. Endpunkte: `GET /helix/streams?user_login=…` (bis 100 Kanäle, alle 60 s), `/helix/users`, `/helix/search/categories`. Spielregeln werden lokal über `game_id` angewendet. CSP erlaubt zusätzlich nur Bilder von `static-cdn.jtvnw.net`, `ddragon.leagueoflegends.com` (Champion-Icons im Pros-Tab) und `*.sndcdn.com` (SoundCloud-Bilder), Abrufe von `soundcloud.com` (nur oEmbed) und als einziges eingebettetes Fenster `w.soundcloud.com` (Player). Kein Scraping, keine inoffiziellen Endpunkte.

Neue Integrationen zuerst als typisierte Adapter außerhalb der UI planen. Mock- und echte Daten müssen unterscheidbar bleiben; Lade-, Fehler-, Offline- und Nicht-verfügbar-Zustände gehören zur Schnittstelle. Tokens/Secrets niemals in Frontend-Code, `VITE_*`, Logs oder Git ablegen. Native Berechtigungen nur gezielt ergänzen. Eine spätere Datenquelle darf nicht unmittelbar aus beliebigen UI-Komponenten abgefragt werden.

Git: `.gitignore`, `.gitattributes`, Prettier-Konfiguration und Lockfiles liegen bei; der Code liegt öffentlich auf GitHub, Releases siehe „Download“.

Siehe `VALIDATION.md` für den tatsächlichen Prüfstand und `CLAUDE.md` für Arbeitsregeln.

## Kompaktes Desktopfenster

Das Fenster ist voll deckend (die frühere ~92-%-Transparenz wurde auf Benutzerwunsch verworfen) und hat dadurch wieder den normalen Windows-Schatten und abgerundete Ecken. Kein Durchklicken, kein Always-on-top.

**Ressourcen.** Die App soll dauerhaft im Hintergrund laufen können. WebView2 startet mit `--disable-gpu --in-process-gpu` (in `tauri.conf.json`, zusätzlich zu Tauris Standardargumenten): kein eigener GPU-Prozess, Software-Darstellung, gemessen etwa halber Arbeitsspeicher bei gleicher Darstellung. Minimiert wird die WebView als unsichtbar markiert (Chromium drosselt Zeichnen und Timer, `document.hidden`) und auf niedrigen Speicherverbrauch gesetzt; Skripte laufen weiter, Live-Meldungen und Ton funktionieren also. Der Pros-Tab und die Auslastungsanzeige pausieren minimiert; die Twitch-Abfrage läuft weiter, weil sie Live-Meldungen für Kanäle außerhalb von EventSub liefert. Die Titelleiste zeigt live CPU (Anteil an allen Kernen) und Arbeitsspeicher (privater Arbeitssatz, wie Task-Manager) aller Prozesse der App.

**Pet-Modus.** Die Pfoten-Taste neben „Minimieren“ verwandelt die App in ein kleines Pet (eigene SVG-Figur in den Farben des Farbschemas, wählbar unter Settings → Darstellung → Pet: „Minimal“ — flache, abgerundete Form mit schlichten Augen, Standard —, der ursprüngliche „Blob“, „Katze“ oder „Robo“ mit Bildschirm-Gesicht; Liste in `src/features/pet/figures.ts`) unten rechts auf dem Monitor der App, frei auf dem Desktop, nicht immer im Vordergrund. Es schläft, solange keiner der Kanäle live ist, ist wach mit Zähler, wenn welche live sind, und freut sich bei einem neuen Live-Start (Minimal: Bogen-Augen; Blob: Sternaugen und „!“; bei eingeschalteten Animationen dreimal Hüpfen) mit einer Sprechblase „Name ist live!“ (30 s, wie die Meldungen in der App; × schließt sie); Klick auf die Blase öffnet den Stream, der Live-Ton bleibt. Liegt das Pet hinter anderen Fenstern oder ist minimiert, kommt es für die Dauer der Meldung nach vorn und bleibt oben, ohne den Tastaturfokus zu nehmen; danach ist es wieder ein normales Fenster. Läuft ein SoundCloud-Mix, trägt das Pet Kopfhörer, hat die Augen genießerisch geschlossen und eine Note ♪ neben sich; der Tooltip nennt den Track, bei jedem neuen Track nickt es kurz (nur mit Animationen). Rangfolge: Warnung, Live-Meldung, Musik, wach/schlafend. Klick auf das Pet: zurück zur App an die alte Stelle; Ziehen verschiebt es (Position wird bis zum Beenden gemerkt). Technisch dasselbe Fenster und dieselbe WebView (`src-tauri/src/pet.rs`, `src/features/pet/`): Twitch-Abfrage und Live-Meldungen laufen weiter; Auslastungs- und Akkuabfrage pausieren. Das Fenster ist dafür transparent angelegt (`tauri.conf.json`: `transparent: true`, ohne `backgroundColor`); die normale App malt ihren Hintergrund selbst voll deckend. Im Pet-Modus: kein Seitenverhältnis, kein Zoom, kein Rahmen, keine abgerundeten Ecken; das Fenster ist nur so groß wie das Pet und wächst nur für die Sprechblase.

**Warnungen und „Nicht stören“.** `src-tauri/src/pc.rs` misst im Hintergrund alle 10 s (Home 5 s, PC-Seite 2 s; minimiert gemessen 0,03 % CPU für die ganze App): CPU aus `GetSystemTimes`, RAM aus `GlobalMemoryStatusEx`, Grafikkarte aus den Windows-Leistungsindikatoren „GPU Engine“ (wie der Task-Manager, per DXGI der Grafikkarte mit dem meisten Videospeicher zugeordnet), Laufwerk aus `GetDiskFreeSpaceEx`, pro Programm CPU/RAM/GPU (Name aus der Dateibeschreibung, z. B. „Google Chrome“). CPU oder RAM ≥ 90 % für 30 s bzw. Grafikkarte ≥ 95 % für 60 s ergibt höchstens alle 30 min eine Warnung mit den zwei größten Verursachern; Akku ≤ 15 % (Prüfung alle 10 min) einmal, bis das Gerät wieder geladen wurde. Beide Warnungen einzeln abschaltbar (Settings → Benachrichtigungen); in der App als Karte (Klick öffnet PC bzw. Devices), im Pet-Modus mit besorgtem Gesicht und Sprechblase. „Nicht stören“ (Glocke in der Titelleiste, auch in den Settings, bleibt gespeichert, wird nie automatisch geschaltet): kein Live-Ton, das Pet kommt bei Meldungen nicht nach vorn; Meldungen erscheinen trotzdem still.

**Warnton und Programm schließen.** Überlast-Warnungen spielen einen eigenen Ton: „warning alert“ von Universfield (Pixabay), vom Benutzer ausgewählt, einmalig in WAV umgewandelt (`src/assets/warning-alert.wav`, `play_alert_sound(volume, sound: "warning")`, gleiche Lautstärke wie der Live-Ton, still bei „Nicht stören“). Karte und Pet-Blase zeigen für den größten Verursacher mit eigenem Fenster „<Programm> schließen“: wie das X am Fenster (`WM_CLOSE` an die sichtbaren Hauptfenster des Programms in der eigenen Sitzung, `close_program(exe, force: false)`), das Programm kann also noch nach dem Speichern fragen. Läuft es nach 4 s noch (`program_running`), wird „Beenden erzwingen“ angeboten (`TerminateProcess`, Hinweis auf Datenverlust). Windows-Systemprozesse (u. a. explorer, dwm, csrss, svchost, lsass, msedgewebview2) und blank. selbst werden nie geschlossen; Programme ohne eigenes Fenster (z. B. Hintergrunddienste) bekommen keinen Knopf.

**Taskleiste und Infobereich.** blank. hat ein Symbol im Infobereich (unter dem Pfeil unten rechts, `src-tauri/src/tray.rs`, Tauri-Feature `tray-icon`): Linksklick oder „Öffnen“ zeigt die ganze App (aus dem Pet-Modus, minimiert oder verdeckt), „Beenden“ schließt sie. Ein Klick auf den Knopf von blank. in der Taskleiste zeigt im Pet-Modus immer die ganze App statt des Pets: Windows aktiviert das Fenster dabei (oder will es minimieren, wenn das Pet gerade aktiv war); `pet.rs` fängt beides ab, und `taskbar.rs` prüft auf einem eigenen Thread per UI Automation (nur lesend), ob die Maus wirklich auf dem eigenen Knopf liegt (`Appid: <Pfad der EXE>`). So öffnen andere Aktivierungen die App nicht, etwa wenn Windows dem Pet nach dem Startmenü oder einem Taskleisten-Menü den Fokus zurückgibt; ein Minimieren, das nicht vom eigenen Knopf kam, wird normal ausgeführt. Die Oberfläche verlässt den Pet-Modus auf das Ereignis `show-app` (`App.tsx`). Das X in der Titelleiste beendet die App weiterhin (nicht in den Infobereich).

**Nur eine Instanz.** Ein zweiter Start (Doppelklick, Autostart plus manueller Start) beendet sich sofort und holt das laufende Fenster nach vorn, auch aus dem minimierten Zustand und als ganze App aus dem Pet-Modus (benannter Mutex `Local\blank.single-instance`, Fensternachricht `blank.show-app`). Zwei Instanzen lagen sonst deckungsgleich auf dem zweiten Monitor, meldeten jeden Live-Start doppelt und überschrieben sich gegenseitig die Einstellungen.

**Startposition.** Das Fenster öffnet mittig im Arbeitsbereich des zweiten Monitors (erster Monitor, der nicht der Hauptmonitor ist); mit nur einem Monitor an der Standardposition. Unterschiedliche Anzeigeskalierungen der Monitore werden berücksichtigt, sind aber nicht getestet (hier beide 96 DPI).

**Festes Seitenverhältnis 860 : 640.** Das Fenster lässt sich nur proportional ziehen (Breite 720–1000, Höhe folgt: 536–744); `src-tauri/src/window_aspect.rs` erzwingt das DPI-genau über `WM_SIZING`, `WM_WINDOWPOSCHANGING` und `WM_GETMINMAXINFO`. Der WebView-Inhalt wird per Zoom mitskaliert, die Seite ist intern immer exakt 860 × 640 CSS-Pixel groß und bricht nie um. Übersichtsseiten (Home, League, Devices, PC) füllen diese Fläche genau; Twitch und Settings scrollen. Maximieren deaktiviert, kein Vollbild. Die Oberfläche enthält nur Navigation, Karten und einen globalen Mock-Hinweis. Keine Website oder Landingpage; der Browser dient nur der Entwicklungsprüfung. Kompakte Layoutregeln liegen in src/styles/desktop.css.

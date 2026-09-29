# Chrome Web Store: Texte für die Erweiterung

Zum Einfügen, wenn die Erweiterung im Chrome Web Store veröffentlicht wird (dann geht die
Installation in Chrome, Edge, Brave und Opera mit einem Klick, und Updates kommen von selbst).
Hochzuladen ist `blank-extension.zip` aus dem neuesten Release (die `manifest.json` liegt darin
oben). Vor jedem neuen Upload `version` in `extension/public/manifest.json` erhöhen.

## Eintrag

- **Name:** blank. Zusammen schauen (aus dem Manifest)
- **Kategorie:** Unterhaltung
- **Sprache:** Deutsch
- **Kurzbeschreibung** (aus dem Manifest, höchstens 132 Zeichen): Twitch zusammen schauen:
  Wechselst du den Kanal, wechseln alle im Raum mit. Gleiche Räume wie in blank.
- **Beschreibung:**

  > Schau Twitch mit Freunden zusammen, jeder im eigenen Browser: eingeloggt, mit Chat und allem,
  > wie immer. Nur eins ist neu: Wechselst du im Twitch-Tab den Kanal, wechseln alle im Raum mit.
  >
  > So geht's: Im Twitch-Tab auf das blank.-Symbol klicken → „Raum starten“ und den Code an deine
  > Freunde schicken. Sie geben ihn bei sich ein → „Beitreten“. Dieser Tab folgt ab dann dem Raum.
  > „Neu synchronisieren“ lädt bei allen neu.
  >
  > Gleiche Räume und Codes wie in der Desktop-App blank.: Freunde können dort oder im Browser sein.
  >
  > Was die Erweiterung tut und nicht tut:
  > • Sie liest nur die Adresse genau eines Twitch-Tabs (welcher Kanal läuft) und lädt dort einen
  > Kanal oder neu. Sie liest keine Inhalte von Twitch und fügt nichts in die Seite ein.
  > • Nachrichten im Raum (Name, Kanal) werden im Browser verschlüsselt (AES-256-GCM, Schlüssel nur
  > aus dem Raum-Code) und nur als unlesbarer Text über zwei öffentliche Vermittler (HiveMQ,
  > Mosquitto) an die anderen im Raum geschickt. Kein Konto, keine Werbung, keine Statistik.
  > • Ein Tab, der Twitch verlässt, gehört wieder dir.
  >
  > Quellcode: https://github.com/maltekruse23-oss/blank (Ordner `extension`)

- **Screenshots:** 1280 × 800 oder 640 × 400 Pixel, z. B. das kleine Fenster der Erweiterung über
  einem Twitch-Tab (Raum starten, im Raum mit Mitgliedern).
- **Symbol:** `extension/public/icons/128.png`

## Datenschutz (Reiter „Datenschutz“)

- **Einziger Zweck:** Twitch-Kanalwechsel in einem Raum mit Freunden gleichzeitig ausführen.
- **Begründung „storage“:** Merkt sich den Namen für den Raum und den letzten Raum-Code (nur als
  „Wieder beitreten“ angeboten) sowie den Zustand des offenen Raums, damit er einen Neustart des
  Hintergrunds übersteht.
- **Begründung Host-Berechtigung twitch.tv:** Liest die Adresse des einen Twitch-Tabs, der dem Raum
  folgt (welcher Kanal läuft), und lädt dort den Kanal, auf den jemand umgeschaltet hat.
- **Remote-Code:** Nein.
- **Datennutzung:** „Webprotokoll“ bzw. „Websiteinhalte“ ankreuzen, weil der Kanal des Twitch-Tabs
  (verschlüsselt) an die anderen im Raum geht; nichts wird verkauft, nicht für Werbung oder
  Kreditwürdigkeit genutzt und nur für den einen Zweck übertragen.
- **Datenschutzerklärung (Link):**
  https://github.com/maltekruse23-oss/blank/blob/main/extension/PRIVACY.md

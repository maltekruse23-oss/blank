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

- **Screenshots:** `extension/store/screenshot-1-1280x800.png`, `-2-` und `-3-` (24-Bit-PNG ohne
  Alpha; in 640 × 400 liegen sie daneben).
- **Symbol:** `extension/store/icon-128.png` (96 px Bild mit 16 px durchsichtigem Rand, wie Google
  es verlangt).
- **Kleine Werbekachel:** `extension/store/promo-440x280.png`
- **Sichtbarkeit (Reiter „Vertrieb“):** „Nicht gelistet“ – nur wer den Link hat, findet sie.

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

## Opera Add-ons (eigener Eintrag, kostenlos)

Ohne eigenen Eintrag installieren Opera-Nutzer über die Chrome-Web-Store-Seite: Opera bietet dort
„Chrome-Erweiterungen installieren“ an. Eigener Eintrag unter https://addons.opera.com/developer/
mit demselben `blank-extension.zip` und denselben Texten wie oben:

- **Category:** Social. **Language:** Deutsch.
- **Icon (64 × 64):** `extension/store/icon-64.png`
- **Screenshots:** `extension/store/screenshot-1-612x408.png`, `-2-`, `-3-` (will die Seite eine
  andere Größe, die 1280 × 800-Bilder).
- **Privacy policy:** derselbe Link wie oben.
- **Hide the add-on from search results …:** anhaken (wie „Nicht gelistet“).
- **Notes for reviewers:** The code is bundled with Vite. Full source:
  https://github.com/maltekruse23-oss/blank (folder `extension`). Build: `pnpm install
--frozen-lockfile`, then `pnpm extension:build`; the result is in `extension/dist`. The extension
  only reads the address of one twitch.tv tab and exchanges encrypted room messages over two public
  MQTT brokers (see privacy policy).

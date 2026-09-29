# Datenschutz: blank. Zusammen schauen (Browser-Erweiterung)

Stand: September 2026

**Was die Erweiterung verarbeitet**

- Die Adresse genau eines Twitch-Tabs, den du einem Raum zuordnest, um zu erkennen, welcher Kanal
  läuft. Keine anderen Tabs, keine Inhalte von Twitch, kein Verlauf.
- Den Namen, den du für den Raum eingibst, und den Raum-Code.

**Wohin es geht**

- Solange du in einem Raum bist, gehen dein Name, der Kanal und Hinweise wie „ist da“ oder „hat
  verlassen“ an die anderen im Raum. Sie werden vorher in deinem Browser verschlüsselt
  (AES-256-GCM; der Schlüssel entsteht nur aus dem Raum-Code) und nur als unlesbarer Text über zwei
  öffentliche Vermittler geschickt: `broker.hivemq.com` und `test.mosquitto.org`. Die Vermittler
  sehen nur verschlüsselten Text und eine zufällige Raum-Kennung, nicht den Code.
- Sonst nirgendwohin. Keine Konten, keine Werbung, keine Statistik, kein Verkauf von Daten.

**Was gespeichert wird**

- In deinem Browser (`chrome.storage`): dein Name, der letzte Raum-Code (nur als „Wieder
  beitreten“ angeboten, nie automatisch betreten) und, solange der Browser läuft, der offene Raum.
  Entfernst du die Erweiterung, ist alles weg.

**Fragen**

Über die Issues des Projekts: https://github.com/maltekruse23-oss/blank/issues

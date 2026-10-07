# Roadmap

Stand: 07.10.2026. Gilt für mayhemstats.lol, die Mayhem-App, den Collector und die Mayhem-Teile von blank.
Details stehen in [apps/mayhem-site/PLAN.md](apps/mayhem-site/PLAN.md), [MAYHEM-BERATER.md](MAYHEM-BERATER.md) und [AI-NOTES.md](AI-NOTES.md).

## Arbeitsregeln

- Pro Etappe ein Ziel und ein Thread.
- Die nächste Etappe startet erst, wenn die aktuelle live und geprüft ist.
- Neue Ideen kommen unter „Später“. Ob sie nach vorne rücken, entscheidet malte.
- „Jetzt“ hat höchstens 2 Punkte, „Als Nächstes“ höchstens 3.
- Ist ein Punkt fertig, fliegt er hier raus und steht mit Datum in AI-NOTES.md.

## Jetzt

1. **Mayhem-App (PR #46) auf Windows testen**
   Ziel: `mayhem.exe` läuft auf Windows und zeigt die Champ-Karte mit Zahlen von arammeta.com im Tribüne-Look.
   Fertig, wenn: Der alte lokale arammeta-Stand ist verworfen, `pnpm mayhem:build` läuft auf malte's PC durch, `mayhem.exe` startet, „Beispiel: Alistar“ sieht richtig aus, Werte (mit „arammeta.com, Patch …“) und Bilder kommen, Funde sind behoben und malte hat #46 gemergt.

2. **Englische Version der Website mit Server-Kürzel und Server-Filter**
   Ziel: Spieler von allen Servern können mayhemstats.lol auf Englisch lesen und nach ihrem Server filtern.
   Fertig, wenn: Alle Seiten und Meldungen gibt es auf Englisch und Deutsch, die Sprache ist umschaltbar und hat eigene Adressen, Rangliste und Spielerseiten zeigen das Server-Kürzel, die Rangliste hat einen Server-Filter. Die Seite ist veröffentlicht und live geprüft.

## Als Nächstes

1. **Neues Design für Website und Mayhem-App** (Benutzerauftrag 07.10.2026)
   Ziel: Website und Mayhem-App haben ein neues, gemeinsames Design.
   Gewählt am 07.10.2026: „Arena“ (MAYHEM-DESIGN.md, Vorlage Spielerseite im Artifact „mayhemstats Design 2“).
   Fertig, wenn: Website und App sind im Design „Arena“ umgebaut, die Website ist veröffentlicht und live geprüft, die App ist auf Windows getestet.

2. **Lobby-Check**
   Ziel: In der Champ-Auswahl zeigt die App je Mitspieler Rang, Leistung Ø als Note, seltensten Tag und Spiele mit dem Champion aus mayhemstats.lol, zusammen mit der Champ-Karte in einer Karte.
   Fertig, wenn: In einer echten Champ-Auswahl stehen bei allen Mitspielern diese Werte (oder „nicht in der Datenbank“), jeder Champion auf der Bank hat eine Stufe S bis D. Die App liest nur und nur Daten von mayhemstats.lol. Die Version ist auf Windows getestet und veröffentlicht. Danach folgen die Gegner auf dem Ladebildschirm (Live-Client-Schnittstelle einmal beim Spielstart).

## Später

- **Mayhem-App ausbauen** (Benutzerwunsch 07.10.2026, „machen wir später“)
  Ziel: Die App kann mehr als die Champ-Karte.
  Fertig, wenn: malte hat entschieden, welche Teile dazukommen (z. B. eigenes Profil und Rang, Tier-Liste, Karte nach dem Spiel), und sie sind gebaut und getestet.

- **Champ-Karte in blank. mit echtem Client bestätigen** (malte)
  Ziel: Es ist belegt, dass die Champ-Karte in einer echten Mayhem-Champ-Auswahl funktioniert.
  Fertig, wenn: Die Karte erscheint in einer echten Champ-Auswahl, AP, AD und Tank wechseln die Augment-Liste, das Ergebnis steht in VALIDATION.md.

- **Riot fragen** (malte schickt, Claude schreibt den Text)
  Ziel: Riot hat eigene Rangliste und Live-Hinweise im Spiel bewertet, bevor wir öffentlich werben oder die Mayhem-App öffentlich machen.
  Fertig, wenn: Die Anfrage ist im Developer Portal (App 887776) gestellt und Riots Antwort steht in AI-NOTES.md.

- **Reddit-Post** (malte postet, Claude überarbeitet den Entwurf)
  Ziel: Mehr Leute kennen mayhemstats.lol und laden den Collector.
  Fertig, wenn: Website und `/mitmachen` mit Download sind live, Riot ist gefragt, der Entwurf (Deutsch und Englisch) ist ohne Gruppen und auf Tribüne-Stand, und malte hat ihn gepostet.

- **Live-Augments im Spiel**
  Ziel: Die Mayhem-App erkennt neue Augment-Angebote und Rerolls sofort und zeigt ihre Note für den gewählten Build.
  Fertig, wenn: Im echten Spiel erscheinen die Noten für die Angebote auf Level 7, 11 und 15 und nach jedem Reroll innerhalb einer Sekunde. Gelesen wird nur ein Bildschirmausschnitt des League-Fensters mit Windows-Texterkennung. Immer werden mehrere Optionen mit Zahlen gezeigt. Vor einer öffentlichen Version ist Riot gefragt.

- **Collector vertrauenswürdiger machen** (wartet auf malte's Ja)
  Ziel: Leute laden den Collector ohne Bedenken herunter.
  Fertig, wenn: GitHub Actions baut die EXE aus dem öffentlichen Code, mit SHA-256 und Herkunftsnachweis. `/mitmachen` hat drei klare Zeilen (was gelesen wird, was nie passiert, Link zu Quellcode und VirusTotal) und „Du bist vielleicht schon drin, such deinen Namen“. Der Download zeigt auf den öffentlichen Build. Danach eigens: Sammeln in der Mayhem-App, Microsoft Store, Code-Signatur.

- **ARAMGG-Spalte** (wartet auf deren Bedingungen und API-Doku)
  Ziel: Weltweite Zahlen stehen in einer eigenen, klar beschrifteten Spalte „Weltweit (ARAMGG)“.
  Fertig, wenn: malte hat Nutzungsbedingungen und API-Doku aus dem Entwicklerportal geliefert, die Bedingungen sind erfüllt, die Spalte ist live und nirgends mit unseren Noten und Rängen gemischt.

- **Weiterleitung von www.mayhemstats.lol**
  Ziel: `www.mayhemstats.lol` führt auf `mayhemstats.lol`.
  Fertig, wenn: `https://www.mayhemstats.lol/` und Unterseiten leiten dauerhaft auf dieselbe Adresse ohne `www` weiter. Die übrigen DNS-Einträge sind unverändert.

- **Teilen-Vorschaubilder**
  Ziel: Links auf Spiel- und Spielerseiten zeigen beim Teilen ein eigenes Vorschaubild.
  Fertig, wenn: Discord, WhatsApp und X zeigen für `/spiel/<id>` und `/players/<Riot-ID>` ein Bild mit Note bzw. Rang.

- **Item-Sets und Beschwörerzauber in den Client schreiben** (MAYHEM-BERATER.md 6a)
  Ziel: Die App legt passende Item-Sets „blank. …“ und Zauber an. Für beides gibt es einen Schalter.
  Fertig, wenn: Mit Schalter an stehen Set und Zauber nach der Champ-Auswahl im Client. Eigene Sets bleiben unberührt. Mit Schalter aus passiert nichts.

- **Situations-Tags gegen das Gegnerteam** (MAYHEM-BERATER.md 3.8)
  Ziel: Builds tragen Tags wie Anti-Tank, Anti-Heilung oder Gegen Burst, je nach Gegnerteam.
  Fertig, wenn: Jeder Tag stützt sich auf gemessene Unterschiede mit genug Spielen und hat den Rückblick-Test bestanden.

- **Datenlizenz arammeta.com klären**
  Ziel: Die Zahlen von arammeta.com dürfen in einer öffentlichen Mayhem-App stehen.
  Fertig, wenn: Der Macher (GitHub Lanternko) hat schriftlich zugestimmt. Claude schreibt die Nachricht. Vorher gibt es keine öffentliche Version mit diesen Zahlen.

- **Chinesische Mayhem-Seiten (Hexdata, RESG) prüfen** (vorerst durch arammeta erledigt)
  Ziel: Wissen, ob sie eine offene API oder eine Erlaubnis für ihre Zahlen bieten.
  Fertig, wenn: API, Werte und Patch-Stand sind geprüft und malte hat entschieden. Nie Scraping.

- **Kleinigkeiten auf der Live-Seite**
  Ziel: Die Seite verhält sich sauber für Suchmaschinen und Downloads.
  Fertig, wenn: `/players/<unbekannt>` antwortet mit 404, jede Seite hat einen eigenen `<title>` und die Collector-EXE kommt mit `Content-Length`.

- **Sicherheits- und Dependabot-Hinweise ansehen**
  Ziel: Bekannte Lücken in Abhängigkeiten sind behoben oder bewusst offen.
  Fertig, wenn: Alle Hinweise auf GitHub sind durchgesehen und jeder ist behoben oder mit Grund geschlossen.

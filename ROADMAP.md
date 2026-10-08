# Roadmap

Stand: 08.10.2026 (Fokus Mayhem-App + Website). Gilt für mayhemstats.lol, die Mayhem-App, den Collector und die Mayhem-Teile von blank.
Details stehen in [apps/mayhem-site/PLAN.md](apps/mayhem-site/PLAN.md), [MAYHEM-BERATER.md](MAYHEM-BERATER.md) und [AI-NOTES.md](AI-NOTES.md).

## Arbeitsregeln

- Pro Etappe ein Ziel und ein Thread.
- Die nächste Etappe startet erst, wenn die aktuelle live und geprüft ist.
- Neue Ideen kommen unter „Später“. Ob sie nach vorne rücken, entscheidet malte.
- „Jetzt“ hat höchstens 2 Punkte, „Als Nächstes“ höchstens 3.
- Ist ein Punkt fertig, fliegt er hier raus und steht mit Datum in AI-NOTES.md.
- Ausnahme 08.10.2026 (malte: „noch keine Tests, erstmal weiter“): Etappen 2b, 2c und 3a gehen ohne vorherigen Test weiter. Die offenen Tests stehen gesammelt unter „Später“ → „Mayhem-Teile mit echtem Client bestätigen“.

## Jetzt

Fokus seit 08.10.2026 (malte): nur Mayhem-App und Website. blank. ist pausiert (malte arbeitet später daran weiter); bestehende blank.-Installationen werden per Update zur Mayhem-App.

1. **blank. wird zur Mayhem-App** (malte 08.10.2026: „bestehende App von blank auf anderen PCs soll mit Patch zu Mayhem umgewandelt werden“, Daten: „Aufräumen“)
   Ziel: Wer blank. installiert hat, bekommt mit dem nächsten Update die Mayhem-App an derselben Stelle (Release-Asset `blank.exe` = Mayhem-Build). Beim ersten Start räumt sie blank. auf: zuerst die Gaming-Optimierung zurücknehmen, dann Autostart, Twitch-Anmeldung, Einstellungen und ARAM-Spiele von blank. löschen.
   Fertig, wenn: Ein blank. v0.9.2 wird per Update-Klick zur Mayhem-App, die Optimierungen sind exakt zurückgesetzt, nichts von blank. bleibt außer dem Ordner, Verknüpfungen starten die Mayhem-App; auf Windows geprüft.
   Stand 08.10.2026: gebaut im PR `claude/blank-wird-mayhem` (Release hängt den Mayhem-Build auch als `blank.exe` an, Aufräumen in `from_blank.rs`, README oben englisch). Offen: der echte Durchlauf v0.9.2 → nächstes Release auf Windows (geht erst nach dem Release, VALIDATION).

2. **Eine öffentliche Rangliste: „Find my Mayhem rank“** (malte 08.10.2026: „keine Gruppen, nur eine Rangliste, auf ‚Mayhem-Rang herausfinden‘ klicken und automatisch in die öffentliche Rangliste“)
   Ziel: Ein Klick in der Mayhem-App lädt die letzten Mayhem-Spiele hoch und trägt einen in die öffentliche Rangliste ein; danach geht jedes neue Spiel nach Spielende von selbst hoch. Ob man eingetragen ist, weiß der Server (die App speichert nichts).
   Fertig, wenn: Nach dem Klick steht man mit Rang auf mayhemstats.lol und in der App, neue Spiele erscheinen ohne weiteren Klick, Austragen über „Daten entfernen“ der Website; Website und App zeigen dieselben Zahlen.
   Stand 08.10.2026: gebaut im PR `claude/find-my-rank` (Knopf auf Home und Rang, Upload über die Archiv-Endpunkte des Collectors, automatisch nach jedem Spiel nur nach dem eigenen Klick und solange die Website einen listet; keine API-Änderung, nur Texte auf `/privacy` und `/privacy/remove` für Codex). Offen zur Entscheidung: wer schon über Mitspieler gelistet ist, sieht seinen Rang, aber keinen Knopf, und lädt deshalb nie von selbst hoch. Offen: Test mit echtem Client auf malte's PC (VALIDATION), Veröffentlichung der Website-Texte.

## Als Nächstes

0. **Karte nach dem Spiel in der Mayhem-App** (malte 08.10.2026: „eine After-Game-Card auch mit einbauen wie bei blank“; startet, sobald „Find my Mayhem rank“ gemergt ist, weil beide dieselbe Spielende-Erkennung nutzen)
   Ziel: Direkt nach jedem ARAM-Mayhem-Spiel zeigt die Mayhem-App eine Karte wie blank.s `AramResult` (in der App, kein Popout): Ergebnis, Skin-Splash, Schaden zählt hoch, K/D/A, Schaden/Min, Team-Anteil, Augments, Freunde im Spiel; neue Rekorde gegen die Rekorde der Website; Rang-Band mit MP von der Website, wenn man eingetragen ist.
   Fertig, wenn: Nach einem echten Spiel erscheint die Karte einmal, Zahlen stimmen mit der Website überein, ohne Animationen steht sofort der Endstand da.

1. **Englische Version der Website mit Server-Kürzel und Server-Filter**
   Ziel: Spieler von allen Servern können mayhemstats.lol auf Englisch lesen und nach ihrem Server filtern.
   Fertig, wenn: Alle Seiten und Meldungen sind nur auf Englisch (Benutzerentscheidung 08.10.2026 „Website auch Englisch only.“: kein Deutsch, kein Umschalter), alte deutsche Adressen (`/de/…`) leiten dauerhaft auf die englische Seite weiter, Rangliste und Spielerseiten zeigen das Server-Kürzel, die Rangliste hat einen Server-Filter. Die Seite ist veröffentlicht und live geprüft. (Server-Kürzel und -Filter gemergt in #58–#60, nur Englisch im PR `claude/website-englisch`; wartet auf Codex, Benutzer: Website erstmal hinten an.)

2. **Website im Design „Arena“** (Benutzerauftrag 07.10.2026)
   Ziel: Die Website hat dasselbe Design wie die Mayhem-App (die App ist seit #62/#63 im Design „Arena“).
   Gewählt am 07.10.2026: „Arena“ (MAYHEM-DESIGN.md, Vorlage Spielerseite im Artifact „mayhemstats Design 2“).
   Fertig, wenn: Die Website ist im Design „Arena“ umgebaut, veröffentlicht und live geprüft.
   Stand 08.10.2026: umgebaut im PR `claude/website-arena` (alle Seiten, Regel „Übersicht vor Vollständigkeit“, lokal mit erfundenen Daten bei 390/1280/1920 px und axe geprüft); wartet auf Merge, Veröffentlichen über Codex (`apps/mayhem-site/DEPLOY.md`) und Live-Prüfung.

3. **Lobby-Check**
   Ziel: In der Champ-Auswahl zeigt die App je Mitspieler Rang, Leistung Ø als Note, seltensten Tag und Spiele mit dem Champion aus mayhemstats.lol, zusammen mit der Champ-Karte in einer Karte.
   Fertig, wenn: In einer echten Champ-Auswahl stehen bei allen Mitspielern diese Werte (oder „nicht in der Datenbank“), jeder Champion auf der Bank hat eine Stufe S bis D. Die App liest nur und nur Daten von mayhemstats.lol. Die Version ist auf Windows getestet und veröffentlicht. Danach folgen die Gegner auf dem Ladebildschirm (Live-Client-Schnittstelle einmal beim Spielstart).
   Wartet auf malte: Dürfen Riot-IDs der Mitspieler an mayhemstats.lol gehen? In welche App? Stufen der Bank von arammeta oder nur mayhemstats.lol? Privat, bis Riot geantwortet hat?

## Später

- **Mayhem-App ausbauen** (Benutzerwunsch 07.10.2026, „machen wir später“)
  Ziel: Die App kann mehr als die Champ-Karte.
  Fertig, wenn: malte hat entschieden, welche Teile dazukommen (z. B. Karte nach dem Spiel, Angebote im Spiel, Item-Sets und Zauber – dafür bräuchte sie Einstellungen), und sie sind gebaut und getestet. Home, Tier-Listen und Rang-Seite kamen mit #63.

- **Mayhem-Teile mit echtem Client bestätigen** (malte, wenn er testen will)
  Ziel: Es ist belegt, dass Champ-Karte, Item-Set und Zauber (2c), Angebote im Spiel (2b) und genommene Augments (3a) im echten Client bzw. Spiel funktionieren.
  Fertig, wenn: Die Prüfschritte der Nachträge vom 06.–08.10.2026 in VALIDATION.md sind auf Windows durchgegangen und die Ergebnisse stehen dort. Dazu gehören jetzt auch: Mayhem-App im Design „Arena“ (`pnpm mayhem:build` auf malte's PC, Vollbild) und echter Spieler und Rang (#62–#74).

- **Riot fragen** (malte schickt, Claude schreibt den Text)
  Ziel: Riot hat eigene Rangliste, Live-Hinweise im Spiel, das Lesen der Angebote per Bildschirmausschnitt und das Schreiben von Item-Sets und Zaubern bewertet, bevor wir öffentlich werben oder etwas davon öffentlich machen.
  Fertig, wenn: Die Anfrage ist im Developer Portal (App 887776) gestellt und Riots Antwort steht in AI-NOTES.md.

- **Reddit-Post** (malte postet, Claude überarbeitet den Entwurf)
  Ziel: Mehr Leute kennen mayhemstats.lol und laden den Collector.
  Fertig, wenn: Website und `/mitmachen` mit Download sind live, Riot ist gefragt, der Entwurf (Deutsch und Englisch) ist ohne Gruppen und auf Tribüne-Stand, und malte hat ihn gepostet.

- **Offmeta-Builds** (Benutzerwunsch 08.10.2026: „meine App soll Offmeta-Builds haben, z. B. AP-Alistar mit passenden Mayhem-Augments, super spielbar“)
  Ziel: Champ-Karte und Mayhem-App zeigen je Champion spielbare Builds abseits der Hauptrichtung (z. B. AP-Alistar) mit den Augments, die dazu passen, immer mit Spielen und Siegquote.
  Weg (malte 08.10.2026: Offbuilds gibt es auch im normalen League, Items sind gleich; dann „ich will nichts von Hand pflegen“, „darum brauchen wir ein System für Offmeta-Builds“): das Offmeta-System in `features/aram/combos.ts` rechnet alles aus arammetas Zahlen und den Daten der Items und Augments (Regeln statt Listen, siehe Mayhem-Combos); keine von Hand gepflegte Build-Liste, Guide-Seiten (u.gg, mobafire, mobalytics, aramonly) nur als Link, nie auslesen. Mana-Items markiert.
  Stand 08.10.2026: gebaut – Richtungen AP/AD/Tank (36 Offmeta-Builds über alle Champions, darunter AP-Alistar; Link „Guides auf aramonly.com“) und die Themen-Combos derselben Engine (Mayhem-Combos). Offen: die Seite „Offmeta“ in der Mayhem-App über alle Champions (bräuchte alle 173 Champion-Dateien, in Rust höchstens alle 6 h).
  Fertig, wenn: Für jeden Champion mit genug Spielen in einer selten gespielten Richtung steht ein „Offmeta“-Build (Kern, Stiefel, passende Augments) auf der Karte, eine Seite „Offmeta“ in der Mayhem-App listet die stärksten über alle Champions, und die Karte sagt ehrlich, ob die Zahlen aus ganzen Spielen oder aus Einzelwerten stammen.

- **Mayhem-Combos: Augments + Items mit Thema, für jeden Champion** (Benutzerwunsch 08.10.2026: „z. B. Illaoi ‚Maximum Heal‘: die besten Healing-Augments, die man auf Illaoi kriegen kann, mit einem Full-Heal-Build … für jeden Champ coole Mayhem-Combos, das soll meine App ausmachen“; zweites Beispiel: „Warwick Krit, komplettes Krit-Item-Build mit den besten Krit-Augments“; getaggt Meta/Offmeta; „ich will nichts von Hand pflegen“)
  Ziel: Für jeden Champion mehrere Combos mit Thema (z. B. Maximum Heal, Riesen-Tank, Full Crit, Feuerteufel), je die passenden Augments, die auf ihm vorkommen, und ein Item-Build zum Thema, mit Zahlen.
  Fertig, wenn: Themen als Regeln über die Daten (Item-Tags und -Texte, Augment-Kategorien und -Texte; keine Listen mit IDs, neue Items und Augments landen von selbst im Thema), je Champion die Combos mit seinen Zahlen bei arammeta (sonst „allgemein“), ehrlich gekennzeichnet („zusammengesetzt“, Meta/Offmeta), auf der Champ-Karte und als eigene Seite in der Mayhem-App.
  Stand 08.10.2026: gebaut bis auf die eigene Seite – 22 Themen plus die Richtungen AP/AD/Tank (`THEMES` in `combos.ts`), Reiter „Combos“ im Popout, Abschnitt „Combos“ auf der Champ-Karte und der Champion-Seite der Mayhem-App; über alle 173 Champions 4–16 Combos je Champion (Median 14), z. B. Illaoi „Maximum Heal“ (Meta), Warwick „Full Crit“ (Offmeta). Offen: Seite „Combos“ über alle Champions (wie „Offmeta“, braucht alle Champion-Dateien), Stiefel je Combo.

- **Build folgt den genommenen Augments** (Benutzerwunsch 08.10.2026: „er erkennt, du nimmst mit Alistar AP-Augments, und schlägt in der App direkt AP-Items vor“; MAYHEM-BERATER.md „Hauptargument“)
  Ziel: Nimmt man im Spiel Augments einer Richtung (z. B. AP auf Alistar), wechselt die Karte von selbst zu dieser Richtung bzw. zum passenden Offmeta-Build und zeigt dessen Items.
  Fertig, wenn: Nach einem genommenen Augment mit klarer Richtung (Kategorie bei arammeta, Umwandler) zeigt die Karte innerhalb einer Sekunde den Build dieser Richtung mit mehreren Item-Optionen und Zahlen; die eigene Wahl per Klick geht immer vor. Braucht 3a (genommenes Augment) und die Offmeta-Builds. Riot-Grauzone (reagiert auf den Spielverlauf): immer mehrere Optionen, vor einer öffentlichen Version Riot fragen.

- **Angebote nach den genommenen Augments ranken** (Etappe 3b, MAYHEM-BERATER.md)
  Ziel: Die nächsten Angebote bekommen ihre Stufe auch danach, welche Augments schon genommen sind.
  Fertig, wenn: Es gibt genug Spiele mit gemeinsamen Augments (heute rund 147 Spiele, zu wenig), der Rückblick-Test ist bestanden, immer mehrere Optionen mit Zahlen.

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
  Fertig, wenn: Alle Hinweise auf GitHub sind durchgesehen und jeder ist behoben oder mit Grund geschlossen. Stand 08.10.2026: Dependabot-Hinweise sind im Repo ausgeschaltet; malte schaltet sie unter Settings → Code security ein.

- **Release nach v0.9.2** (malte gibt frei)
  Ziel: Freunde bekommen die Änderungen seit v0.9.2 (über 25 PRs, u. a. Champ-Karte, 2b, 2c) per Update.
  Fertig, wenn: Version angehoben, Klick-Prüfung „Vor jedem Release“ gemacht, Tag gepusht, `blank.exe` und `mayhem.exe` hängen am Release.

- **Alle sehen dasselbe: Server als einzige Wahrheit** (malte 08.10.2026: „Website und App immer synchron, alle Spieler auf allen Geräten sehen zu jeder Zeit das Gleiche“)
  Ziel: Rang, MP, Rangliste und Rekorde rechnet nur der Server; die arammeta-Daten holt der Server einmal und gibt allen denselben Stand mit Kennung („Patch 16.20 · Stand 14:00“); offene App und Website fragen alle 30–60 s nach Neuem (nicht minimiert); der Server kann eine Mindest-Version der App verlangen.
  Fertig, wenn: Website und Mayhem-App zeigen nach einem Spiel innerhalb einer Minute dieselben Zahlen und dieselben Tierlisten/Combos.

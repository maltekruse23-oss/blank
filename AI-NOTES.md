# Notizen für die nächste KI

Aktuelle zusammenhängende Übergabe: [CLAUDE-HANDOFF-MAYHEM.md](CLAUDE-HANDOFF-MAYHEM.md).
Sie dokumentiert auch den getrennten Website-Ratingstand und die noch offene Statistikseiten-Recherche.

## Mayhem-App: Karte nach dem Spiel — 08.10.2026

- ROADMAP „Als Nächstes 0“, Benutzerwunsch 08.10.2026 „eine After-Game-Card auch mit einbauen wie bei blank“. Gebaut im PR `claude/mayhem-karte`, nicht gemergt; der Test mit einem echten Spiel fehlt (VALIDATION).
- Rust `src-tauri/src/aram/game_card.rs` (nur in `mayhem.rs` registriert): hängt an der Spielende-Erkennung von „Find my Mayhem rank“. `after_game::await_mayhem_game` ist dafür in `started_mayhem_game` und `game_ended` geteilt; `ladder::after_game` liest zwischen Start und Ende die öffentliche Rangliste (`listed_names`, nur Riot-IDs klein geschrieben, ein GET je Spiel, Abgleich auf diesem PC) und startet nach dem Ende `game_card::after_game` als eigene Aufgabe neben dem Upload (beide unabhängig: eine langsame EoG verzögert den Upload nicht). Ablauf wie blank.: EoG `/lol-end-of-game/v1/eog-stats-block` 60 × 1 s nur mit genau dieser Spiel-ID, sonst `/lol-match-history/v1/games/<id>` nach `AFTER_GAME`; `from_eog`/`from_history` + `entries` (blank.s Teile) mit `tracked` = nur der Spieler, `friends` = League-Freunde plus Spieler des Spiels, deren Riot-ID die Rangliste nennt (`own_entry`, per Test). Skins aus dem Spielstart (`note_skins` in `started_game`) kommen über `add_noted_skins` dazu. Augments über `augment_info` (aus `add_augments` herausgezogen, blank. unverändert). Genau eine Karte je Spiel: `SHOWN` im Speicher (höchstens 50 IDs), auch ein Reconnect (zweiter Spielprozess mit derselben ID) zeigt sie nicht noch einmal. Ereignis `mayhem-card` an das Fenster (`emit_to`), auch minimiert.
- Neue Befehle (build.rs, `capabilities/mayhem.json`, Test in `mayhem.rs`): `mayhem_records` (GET `/api/rekorde`, die echte Adresse; `/api/records` gibt es auf der Website nicht) und `mayhem_open_game` (öffnet nur `https://mayhemstats.lol/game/<id>`).
- Frontend: Logik `src/mayhem/afterGame.ts` (`parseRecords` streng, kaputte Kategorie fällt ganz weg; `recordChips`: neuer Platz 1 nur bei echtem Übertreffen, Gleichstand nicht, „Top 10“ nur, wenn die eigene Zeile schlechter ist, die Zeile dieses Spiels zählt nie mit – ein Mitspieler kann es schon hochgeladen haben; `cardLevel` wie `aramHighlight` mit den Rekorden der Website als „Gruppe“; `gameRank` = `rankResult` für einen Schritt der Website, per Test gleich; `cardRank` mit Zuständen ready/waiting/late/remake/unlisted/none). Ansicht `AfterGameView.tsx` (Name wegen Groß/Klein-Kollision mit `afterGame.ts`, wie `ChampCardView`), Dialog über `Overlay` in `ui.tsx` (aus `UpdateButton.tsx` herausgezogen, beide nutzen es). `MeView` hat jetzt `siteId` und `history` (die Karte findet dort den Schritt ihres Spiels). Rang vorher/nachher kommt aus dem Schritt des Profils (die Website rechnet ihn ohnehin), kein eigener Abruf beim Spielstart nötig.
- Entscheidungen ohne Rückfrage: Rekorde je Karte einmal frisch statt einmal pro Sitzung (eine Sitzungs-Kopie meldete nach einem eigenen Rekord im selben Abend einen falschen „New record“); kein Funkenregen und keine Feder wie in blank. – „Arena“ verlangt weich und ohne Blitz, deshalb Licht von unten (gold für legend, eisblau für top), Wappen tritt bei Aufstieg aus einem aufblühenden Licht hervor; Zahl groß in Unbounded wie die Home-Kacheln (Geist Mono hatte breite Kommas); „View on mayhemstats.lol“ nur, wenn das eigene Profil das Spiel hat (für nicht Gelistete wäre ein eigener Abruf `/api/spiel/<id>` nötig – nicht gebaut); in der Vorschau ist der Knopf ausgegraut (keine wirkungslosen aktiven Knöpfe). `motion` bleibt aus dem Mayhem-Bundle: Zählen per `requestAnimationFrame`, Balken per Web Animations, der Rest CSS.
- Grenzen: Ein Spiel, dessen Ende nicht abwartbar ist, bekommt keine Karte (wie beim Upload); wer über Mitspieler gelistet ist, aber nie geklickt hat, lädt nicht hoch – die Karte wartet dann 2 min und sagt „does not have this game yet“, außer ein anderer lädt das Spiel hoch. Fällt eine Nachfrage nach dem Spieler aus („failed“), verschwindet die Rangzeile.

## Mayhem-App: „Find my Mayhem rank“ — 08.10.2026

- ROADMAP „Jetzt 2“, Benutzerentscheidungen 08.10.2026: keine Gruppen, eine öffentliche Rangliste; Klick lädt die Spiele hoch und trägt einen ein, danach jedes neue Spiel von selbst; ob man gelistet ist, weiß der Server, die App speichert dazu keinen eigenen Merker (nur der Upload-Schlüssel, den erst der Klick anlegt, siehe unten).
- Weg gewählt: die Archiv-Endpunkte des Collectors (`/api/archive/enroll`, `/api/archive/contribute`, Rohantwort des Clients je Spiel), nicht blank.'s `/api/games`. Gründe: die Website listet jeden Spieler archivierter Spiele (unter öffentlicher ID mit Riot-ID); `/privacy/remove` (Zustimmungszeile der App) wirkt nur für Spieler ohne eigenes Profil – `/api/games` hätte ein Profil mit Schlüssel angelegt, das `/privacy/remove` mit 409 ablehnt; keine neue API. Kehrseite: ein Hochladen über das Archiv hebt ein früheres Ausblenden nicht auf (das darf es auch nicht, sonst könnte jeder Mitspieler jemanden wieder sichtbar machen) – die App sagt dann „Not listed“.
- „Eingetragen?“ = die Website hat ein Profil: zuerst `/api/players/<PUUID>` (blank.-Hochlader), sonst `/api/players/<Name-TAG>` (Archiv-Spieler haben unter der PUUID kein Profil; `own_profile`, `riot_slug` in `aram_website.rs`). `mayhem_ranks` nutzt das jetzt auch (vorher zeigte es Archiv-Spieler als „nicht in der Datenbank“). Ein über die Riot-ID gefundenes Profil zählt nur, wenn sein neuestes Spiel (vom Client geholt, `/lol-match-history/v1/games/<id>`) den Spieler per PUUID auf dem Champion des Profils zeigt (`newest_game`, `champion_of`) – Riot-IDs werden frei und neu vergeben (Review PR #80); sonst None (Knopf statt fremdem Rang).
- Von selbst nach einem Spiel nur nach dem eigenen Klick dieser Installation (Review PR #80, ersetzt die frühere „Entscheidung ohne Rückfrage“, nach der jeder über Mitspieler Gelistete automatisch hochlud): `upload_after` prüft zuerst, ob der Upload-Schlüssel schon existiert (`has_key`, nur lesen); angelegt wird er nur durch den Klick (`mayhem_find_rank` → `stored_key`, auch wenn nichts Neues hochgeht). Zusätzlich muss die Website den Spieler in dem Moment listen. Grenze (ponytail-Kommentar): ein Schlüssel je Installation – ein anderes Konto, das sich später auf demselben PC anmeldet und gelistet ist, lädt ebenfalls von selbst hoch; je Konto bräuchte einen Merker je PUUID. Über Mitspieler Gelistete ohne Klick sehen ihren Rang, aber keinen Knopf (sie können sich nicht für das automatische Hochladen eintragen) – offen, falls malte das will.
- Rust `src-tauri/src/aram/ladder.rs` (nur in `mayhem.rs` registriert): `mayhem_find_rank` (Client → eigene Mayhem-Spiele der letzten 20, ohne die, die das Profil schon zählt → einzeln mit 3 s Pause hoch, Quittung per SHA-256 wie beim Collector → Profil und Rangliste), Fortschritt als Ereignis `mayhem-upload`. Nach dem Spiel: `game_seen` aus der 5-s-Schleife von `mayhem.rs` (Start nur bei offenem Client, verfolgt wird bis zum Ende des Spielprozesses, auch wenn der Client dazwischen schließt oder neu startet – genau ein Verfolgen je Spiel), `after_game::await_mayhem_game` (aus `game_started` herausgezogen: Sitzung lesen, nur Queue 2400, `WaitForSingleObject`), dann wie blank. 10–45 s auf die History warten (Client weg oder ohne Antwort, z. B. „Close client during game“ = nächster Blick), Profil fragen, fehlende Spiele hoch, Ereignis `mayhem-uploaded` → die App fragt den Rang neu. Fehler nur ins lokale `errors.log`. Gespeichert wird nur der zufällige Upload-Schlüssel (`mayhem.app.upload`/`installation`, `stored_key` in `aram_website.rs`, aus `credential` herausgezogen); ohne ihn würde jeder Start neu angemeldet (Website: drei neue Installationen pro Tag und Adresse). Fehlermeldungen dort englisch.
- Frontend: `src/mayhem/findRank.ts` (Zustände, `found`, `findView`, `CONSENT` – nennt auch, dass danach jedes neue Spiel von selbst hochgeht), `MeNotice` in `pages.tsx` zeigt den Knopf statt „No games yet“, Zustand lebt in `MayhemApp.tsx` (bleibt beim Seitenwechsel, zurück auf „idle“, wenn der Client öffnet oder schließt – evtl. anderes Konto). „Not listed“ bietet „Try again“ (nicht gefunden unter der aktuellen Riot-ID: Umbenennung oder ausgeblendet, die App kann es nicht unterscheiden). Archiv-Spiele kommen ohne Championnamen (`champion`/`championName` leer): `meView` gruppiert nach `championId`, `withChampions` (me.ts) benennt sie aus der arammeta-Liste, ohne Liste „–“. Adapter `findRank`, `onRankUpload`, `onRankUploaded` in `src/adapters/aramSite.ts`.
- Website (nur Text, für Codex, `DEPLOY.md`): `/privacy` nennt die Mayhem-App als Quelle, Wieder-sichtbar nur über den Betreiber oder ein Hochladen mit blank. (Archiv-Uploads heben das Ausblenden nicht auf); `/privacy/remove`: „If you upload with blank. later …“ und „Once hidden, the Mayhem app no longer uploads your games by itself, and uploading with it does not unhide you.“ API unverändert.
- Offen: echter Test auf malte's PC (VALIDATION), Website-Texte live. Grenzen: Spiele, deren Ende die App verpasst (lief nicht, Prozess nicht abwartbar), gehen erst mit dem nächsten Spiel oder Klick hoch; Remakes zählt die Website nicht und sie werden deshalb bei jedem Lauf erneut gesendet (die Website verwirft Doppelte).

## blank. wird zur Mayhem-App — 08.10.2026

- ROADMAP „Jetzt 1“, Benutzerentscheidungen 08.10.2026: bestehende blank.-Installationen werden mit dem nächsten Update zur Mayhem-App, Daten von blank. „Aufräumen“, Repo bleibt öffentlich, blank.-Code bleibt (pausiert). Nicht gemergt, nicht veröffentlicht.
- Release (`release.yml`): baut blank. nur noch zur Prüfung (`pnpm desktop:build`, nicht angehängt), hängt den Mayhem-Build als `mayhem.exe` und dieselbe Datei als `blank.exe` an, Release-Titel „Mayhem vX“. blank.'s Updater (auch v0.9.2) nimmt nur `blank.exe` mit GitHub-SHA-256 und startet sie mit `--after-update <pid>` – das ist der Weg. Die Mayhem-App als `blank.exe` aktualisiert sich danach aus `mayhem.exe` und ersetzt die laufende Datei (Name egal, `replace` nutzt `current_exe`; neuer Test), Verknüpfungen bleiben gültig.
- Aufräumen `src-tauri/src/from_blank.rs`: nur wenn die vom Update ersetzte Datei `<exe>.old` ein blank.-Build ist (Dateibeschreibung „blank.“, `pc::file_description`, gelesen im Setup vor `update::clean_up`; nach Review statt `--after-update` + Dateiname `blank.exe`: sonst lief es bei jedem Mayhem-Update einer Kopie namens blank.exe erneut und nie bei „blank (1).exe“). Hintergrund-Thread aus `mayhem::run` (setup), Reihenfolge Optimierung (`tweaks::undo_all`, neu, nutzt das bestehende Rückgängig) → Autostart (`autostart::remove`, neu, `set(false)` nutzt es) → Twitch-Token (keyring, Name aus `twitch::auth`, jetzt `pub(crate)`) → die beiden Ordner `com.blank.desktop` unter Roaming und Local (ganz, statt Dateiliste: deckt auch `aram-archive/`, `aram-website.json`, `errors.old.log`, `*.tmp` ab; Schutz: nur Ordner mit genau diesem Namen). Erster Fehler hält an und steht im Fehlerlog der Mayhem-App; die Marke `from-blank` im Ordner der Mayhem-App bleibt bis zum Erfolg, jeder Start versucht es still erneut (nur der erste zeigt den Fehler). Befehl `mayhem_moved` (build.rs, `capabilities/mayhem.json`) wartet auf den Thread und gibt einmal eine englische Zeile; `UpdateButton.tsx` wartet auf beide Antworten (`update_news`, `mayhem_moved`) und zeigt dann statt „What's new in …“ „blank. is now the Mayhem app“ mit der Zeile und den Notizen. Englische Update-Fehler nennen die laufende Datei (oft `blank.exe`). README-Link `mayhem.exe` ohne „(available from the next version)“: Merge und Release gehören zusammen, vorher führt der Link ins Leere.
- Entscheidungen ohne Rückfrage: Twitch-Token nur lokal gelöscht, nicht bei Twitch widerrufen (wäre Netzwerk); `blank-extension.zip` hängt weiter am Release (nicht verlangt, sie zu entfernen; nützt ohne blank. wenig); Twitch-Client-ID bleibt am blank.-Prüfbuild in `release.yml`, für später. Release-Text: Deutsch für blank.-Nutzer, „New in the Mayhem app“ unverändert, Download-Abschnitt englisch. README oben englisch (mayhemstats.lol, Mayhem-App, „blank. (paused)“), die lange blank.-Anleitung oben ist raus (steht in der Git-Geschichte und unten unter „Bereiche“).
- Offen: echter Durchlauf erst mit dem nächsten Release (Prüfschritte in VALIDATION). Grenzen: läuft beim Update schon eine `mayhem.exe`, beendet sich die neue `blank.exe` gleich (`only_one`); `.old` bleibt, aufgeräumt wird beim nächsten Start dieser Kopie; blank. ≤ 0.2.0 ohne Updater wird nicht aufgeräumt. „Vor jedem Release“ in VALIDATION ist jetzt die Mayhem-Prüfung, die blank.-Schritte ruhen.

## Mayhem-App: Update-Knopf mit Patchnotes — 08.10.2026

- Benutzerauftrag: „Patch-Button für die App, der direkt die neueste Version holt, mit Patchnotes“. Kein zweiter Updater: `update.rs` ist verallgemeinert. `Exe` aus dem Identifier der Config (`mayhem::IDENTIFIER` → `mayhem.exe` und englische Meldungen, sonst `blank.exe` und die bisherigen deutschen, wortgleich); die Seite kann weder Datei noch Adresse wählen. `pick` (Asset nur aus dem Download-Ordner des Releases, ≤ 100 MB, mit GitHub-SHA-256) und `verify` (jetzt `bool`) für beide gleich. `UpdateInfo.notes` = englische Notizen aus dem Release-Text (`english_notes`: nur Abschnitt „## New in the Mayhem app“, nur „- “-Zeilen, Steuerzeichen raus, höchstens 8 × 300 Zeichen; für blank. leer).
- Übergabe beim Neustart: `mayhem.rs` merkt sich seinen Mutex (`OWNED`) und gibt ihn mit `release()` frei; `update_install` ruft `single_instance::release()` und `mayhem::release()` (jede App besitzt nur ihren). `main.rs` behandelt `--after-update` schon für beide (warten, `mark_updated`), `mayhem.rs` räumt `.old`/`.new` auf (`update::clean_up`) und registriert `update_check`/`update_install`/`update_news` (Capability `mayhem.json` erweitert; die Befehle standen schon in `build.rs`, keine neuen TOML-Dateien).
- Frontend: `src/mayhem/UpdateButton.tsx` (Knopf unten in der Seitenleiste über „Client“, Dialog per Portal in `document.body` – in der Seitenleiste hielt deren `backdrop-filter` das feste Overlay fest, gefunden in der Vorschau), Zustände in `updateView.ts` (prüfen, aktuell, verfügbar mit Notizen, Download mit Balken, Fehler mit „Try again“, offline über `navigator.onLine`). Hook `app/useUpdate.ts` unverändert geteilt (stille Prüfung 20 s nach dem Start, dann täglich – wie blank.; nur ein Punkt am Knopf). Nach dem Update „What's new in …“ aus dem eingebauten Abschnitt. `newsItems`/`inline` nach `app/releaseNotes.tsx` verschoben, damit die Mayhem-App kein `motion` aus `PatchNotes.tsx` mitlädt.
- Nach Review: Startet die neue EXE nach dem Ersetzen nicht (`spawn` schlägt fehl, z. B. Virenscanner), meldet `update_install` `Ok(false)` statt eines Fehlers; `useUpdate` geht in den Zustand `installed` (Mayhem „Update installed – Close Mayhem and open it again“, blank. „installiert – blank. beenden und neu starten“), prüft danach nicht mehr (der laufende Prozess ist noch die alte Version und böte sie wieder an). Die Einzel-Start-Sperren werden erst nach gelungenem Start freigegeben (die neue EXE wartet ohnehin auf das Ende der alten), sonst öffnete ein Start von Hand ein zweites Fenster. Seitenleiste: bei Fensterhöhe ≤ 780 px engere Einträge, sonst passte sie bei der erlaubten Mindesthöhe 660 px nicht mehr; als letzter Ausweg rollt sie selbst.
- Release-Text: neuer Abschnitt „New in the Mayhem app“ (für das nächste Release geschrieben; Rust- und Vitest-Test prüfen, dass er da ist) und eine Zeile „Mayhem-App“ unter „Gut zu wissen“.
- Offen: echter Durchlauf erst mit zwei Releases, die `mayhem.exe` enthalten (v0.9.2 hat keine). Die erste `mayhem.exe` mit Updater muss von Hand geladen werden. Fehlermeldung für nicht-Text-Fehler fällt im geteilten Hook auf Deutsch zurück (kommt bei Tauri praktisch nicht vor).

## Website nur Englisch — 08.10.2026

- Benutzerentscheidung: „Website auch Englisch only.“ Die deutschen Seiten unter `/de`, der Umschalter EN/DE, `proxy.ts` (Sprachkopf), `app/ui/lang.ts` und `app/ui/i18n.ts` (`useLang`, `t(en, de)`, `href()`) sind weg. Texte stehen als einfaches Englisch in `app/views/` und `app/ui/`; Zahlen- und Datumsformate in `app/ui/format.ts` (`num`, `date`, `ago`, `season`, `LOCALE`). Routen bleiben dünn (`app/<seite>/page.tsx` exportiert die Ansicht).
- Alte Adressen: `redirects.ts` (eingebunden in `next.config.ts`) leitet dauerhaft (308, Anfrage bleibt) weiter: `/de` → `/`, `/de/rangliste` → `/leaderboard`, `/de/rekorde` → `/records`, `/de/tierliste` → `/tier-list`, `/de/mitmachen` → `/join`, `/de/spiel/<id>` → `/game/<id>`, `/de/wertung` → `/scoring`, `/de/datenschutz` → `/privacy`, `/de/datenschutz/entfernen` → `/privacy/remove`, sonst `/de/<rest>` → `/<rest>`; die ganz alten Wurzel-Adressen (`/rangliste` …) gehen direkt auf Englisch. Test `src/features/aram/siteRedirects.test.ts` (ersetzt `siteLang.test.ts`, prüft auch, dass jedes Ziel eine Seite hat) und `tests/smoke.mjs` (16 Weiterleitungen gegen die lokale Vorschau).
- Beschriftungen aus `src/`: nur die, die keine API-Antwort sind, wurden englisch-only (`ROLES`, `AXES`, Tags und Abzeichen ohne deutsche Felder, `recordText(c)`, `rankedTags(s, c)`, `seasonStarts(year)` englisch, `weights()` ohne `labelEn`). Die API bleibt unverändert: `RECORDS.title/note` deutsch neben `titleEn/noteEn`, Fehlermeldungen deutsch (die Seiten übersetzen bekannte über `apiError`/`knownApiError` in `app/ui/data.ts`, unbekannte werden „Not available.“). Geprüfte Abnehmer: blank. (`aram_website.rs`, `aram_live.rs`, `aram_archive.rs`), `src/adapters/aramSite.ts`, `src/mayhem/me.ts`; keiner liest die geänderten Beschriftungen.
- Weitere Kleinigkeiten: Data Dragon nur noch `en_US`; Anker auf `/scoring` englisch (`#grade`, `#rank`, `#points`, `#seasons`, `#hidden`, `#faq`), Sprunglink `#content`; API-Anleitung (`api-guide.json`) nur noch englisch mit englischen Platzhaltern; Datenschutzseite: der englische Text entsprach schon dem deutschen Original, nichts weggelassen.
- Offen: Augment-Namen kommen aus dem League-Client der Hochladenden und können deutsch sein (eine englische Quelle wäre eine neue Integration, nur auf Auftrag). Datenschutzseite nennt noch keine Betreiber-Kontaktdaten, keine Rechtsgrundlage und keine Betroffenenrechte (stand schon so im deutschen Original; braucht Angaben des Benutzers). Seiten, die die Regel „Übersicht vor Vollständigkeit“ deutlich verletzen (für den späteren Umbau, hier nicht angefasst): Spielerseite, Champion-Seite, Rangliste, Champions-Liste, Augments/Items-Listen, Spielseite, Startseite. Veröffentlichen über Codex (`apps/mayhem-site/DEPLOY.md`, „Aktueller Auftrag“).
- Geprüft: Website tsc/lint/build, frische lokale D1: `tests/smoke.mjs` grün (mit Weiterleitungen), `tests/all-players.mjs` grün; `tests/integration.mjs` bricht beim Live-Strom mit „Network connection lost“ ab, genauso mit dem Stand von `main` (lokales workerd, nicht durch diese Änderung). Ansicht mit sechs erfundenen Spielern bei 1280 und 390 px (Start, Rangliste, Profil, Spiel, Wertung, Datenschutz, Mitmachen, API-Anleitung, 404): englisch, kein Querscrollen; `/de/spiel/<id>?p=…` landet im Browser auf `/game/<id>?p=…`. Repo: `pnpm test`, `pnpm lint`, Prettier auf den geänderten Dateien.

## Mayhem-App englisch, übersichtlich und für große Fenster — 08.10.2026

- Benutzerwahl: Mayhem-App nur Englisch (blank. bleibt deutsch, auch das Popout `ChampCardView.tsx`). Benutzer: Statistikseiten „überladen und erschlagend“ (Screenshot Yasuo: Team-Profil mit 7 Rohwerten, Mitspieler mit „erwartet · Lift“, Augments mit „Lift · Pick · Spiele“), dazu „maximiert sieht kacke aus“ (1920 × 1080: alles in einer 1180-px-Spalte). Regel „Übersicht vor Vollständigkeit“ (MAYHEM-DESIGN.md) auf jede Seite angewandt.
- Gebaut: `src/mayhem/ui.tsx` (`Tabs` mit Pfeiltasten, `More` = zuerst 5 Zeilen bzw. 12 Karten, Rest hinter „Show n more“, `Top`), `src/mayhem/format.ts` (englische Zahlen, `winsIn` für Tooltips). Je Zeile nur Siegquote groß und Spiele klein; Lift, Pickrate, „expected“, Slots, Rohwerte und DPM nur im Tooltip. Champ-Karte: oben Richtung, Item-Kern und nur Stufe S (Rest „Show all tiers“), darunter „More on X“ mit Reitern Combos/Items/Boots & spells/Augment kinds/Avoid, Combo-Chips je Gruppe zuerst 5 („+n“). Champion-Detail: Kopf mit Stufe und Siegquote, Reiter Augments/Combos/Team role (Balken ohne Zahlen, stärkste Eigenschaft gold), rechts „Strong with“. Augment-Detail ohne Lift-Absatz, „Strong on“ und „Related champions“. Augments als Seltenheits-Reiter, Kategorie als Auswahlliste. Champions: Stufen S und A, Rest hinter „Show all tiers“ (bei Suche/Klasse alles). Patch: Reiter je Art, „Stronger now“/„Weaker now“, Zeile = Quote jetzt + „was …“. Home: leeres Hero ersetzt durch kleinen Hinweis, Schnellreiter-Zeile entfernt (doppelt zur Seitenleiste, „Übersicht“ war ein wirkungsloser Knopf).
- Geteilte Texte: `lang`-Parameter (Standard `'de'`) für `planNote`, `assembledFacts`, `itemTitle`, `slotsText`, `comboNote`, `number`/`percent` (format.ts); neu `spellName`, `THEME_EN`/`themeText`, `COMBO_HONESTY_EN`; Tests für Deutsch und Englisch. `seasonName` bewusst nicht angefasst: `aramRating.ts` muss wortgleich mit der Website-Kopie bleiben (`siteCore.test.ts`), die englische Saison steht in `pages.tsx`. Item-Namen: `aram_champ_info` hat jetzt `english` (Option<bool>, nur `Some(true)` → Data Dragon en_US, Test `item_names_are_english_only_when_asked`); blank. ruft ohne auf und bleibt de_DE. Kategorien nehmen arammetas eigene englische Bezeichnung (die deutsche Tabelle in `tiers.ts` ist weg). Rust-Fehlertexte sind deutsch (blank.), die Mayhem-App zeigt deshalb eigene englische Meldungen.
- Breite: `.mayhem-wrap` bis 1680 px, Spalten in Prozent (`minmax(300px, 30–34%)`), Zeilenlisten ab Breite zweispaltig (auto-fill 340 px), Home-Reihen per Container-Query (`container: home`) genau eine Zeile (4–7 Augments, 3–6 Spiele, übrige `display: none`), Zoom 1,1 ab 1700 px und 1,25 ab 2200 px Fensterbreite.
- Offen/ungeprüft: echte `mayhem.exe` nativ (nur Browser-Vorschau mit nachgestelltem Tauri-Aufruf), Zoom-Stufen im WebView2 auf einem echten 4K-Bildschirm mit Windows-Skalierung, Champ-Karte in der reinen Mock-Vorschau (ohne Rust gibt es keine Karte, wie bisher).

## Offmeta-System und Mayhem-Combos — 08.10.2026

- Benutzerwünsche: „Mayhem-Combos: Augment + Items, z. B. Illaoi ‚Maximum Heal‘ … für jeden Champ coole Mayhem-Combos, das soll meine App ausmachen“, „so viele wie möglich, nicht überladen, nicht nur die langweiligen“, „getaggt mit Meta und Offmeta“, „Warwick Krit – komplettes Krit-Item-Build mit den besten Krit-Augments“, dann „ich will nichts von Hand pflegen“ und „darum brauchen wir ein System für Offmeta-Builds“. Eine erste Idee mit einer Handliste aus IDs (`src/data/mayhemCombos.ts`) wurde deshalb verworfen, bevor sie gebaut war.
- Gebaut: `src/features/aram/combos.ts` (Engine, Tests `combos.test.ts`). `THEMES` = 22 Themen plus AP/AD/Tank als Regeln (Data-Dragon-Tags + arammetas englischer Item-Text, arammetas Augment-Kategorien + englischer Text). `offmetaBuild`, `USELESS_ITEMS`, `MANA_PENALTY`, `META_PRIOR`, `CORE_SIZE` wohnen jetzt dort (champCard.ts exportiert sie weiter). `combosFor` läuft in `metaView`, Ergebnis `ChampView.combos` (≤ 16, geht ins Popout). Rust liefert dafür neu: `tags` je fertigem Item, `text` je Augment (desc_en), `meta.items` (arammetas `itemLut`: Text und Preis, ohne „Deprecated item“).
- Entscheidungen: Augment = im `poolAugments` des Champions (≥ 15 Spiele bei arammeta), mindestens 2 je Combo; Siegquoten zur Ø des Champions gezogen statt zu 50 % (sonst lagen bei Illaoi seltene Augments vorn), die Richtungs-Combos aber wie `offmetaBuild` zu 50 %; ungemessene Items „allgemein“, teuerste zuerst; ein Build nie AP und AD gemischt (erstes gemessenes Schadens-Item entscheidet, sonst die übliche Schadensart des Champions, wenn das Thema genug Items dafür hat). Meta/Offmeta-Regel in `META_ITEM_PICK`/`META_AUGMENT_PICK`. Anzeige: alle Combos als Chips (Meta/Offmeta getrennt), eine offen – so sind alle da (Warwick Krit steht nach Zahlen hinten, ist aber als Chip sichtbar), ohne die Karte zu überladen.
- Live 08.10.2026 (Patch 16.20): Illaoi „Maximum Heal“ Meta (Dropkick, Dawnbringer's Resolve, Upgrade Sheen, Upgrade Sundered Sky; Tanz des Todes, Warmogs, Endlose Verzweiflung, Geistessicht, Gespaltener Himmel), Warwick „Full Crit“ Offmeta (Critical Rhythm, Soul Siphon; Klinge der Unendlichkeit, Lord Dominiks Grüße, Yun Tal, Sterbliche Mahnung, Schildbogen – alle „allgemein“), Alistar AP Offmeta (Rabadon, Kluftformer, Schattenflamme, Sturmblitz, Leerenstab).
- Offen: Seite „Combos“/„Offmeta“ über alle Champions (bräuchte alle 173 Champion-Dateien, in Rust höchstens alle 6 h zwischenspeichern), Stiefel je Combo, Combos nach genommenen Augments („Build folgt den genommenen Augments“).

## Offmeta-Builds — 08.10.2026

- Benutzerwunsch („meine App soll Offmeta-Builds haben, z. B. AP-Alistar mit passenden Mayhem-Augments“; dann „Offbuilds gibt es auch in normalem League, Items sind gleich“, Vorlagen u.gg/mobafire/mobalytics/aramonly). Entscheidung: keine Guide-Seiten auslesen (Scraping, fremde Arbeit; mobafire antwortet ohnehin 403). Stattdessen `offmetaBuild` (champCard.ts): Richtung ohne arammeta-Kern → die drei besten Einzel-Items dieser Richtung (`singleItems` top/bot/popularBad, `kind` aus Data Dragon) mit ≥ 40 Spielen, Siegquote zur Mitte gezogen, Mana zählt dagegen, höchstens 1,5 Punkte unter dem Haupt-Build. Gemessen 08.10.2026: 36 Offmeta-Builds über 173 Champions, AP-Alistar = Rabadon, Shadowflame, Riftmaker (Ø 53,7 % gegen 54,1 % Tank). Karte: Abzeichen „Offmeta“ auf dem Reiter, Zahlen je Item (Tooltip), Hinweis „jedes einzeln gemessen“ (`planNote`). Website-Spiele derselben Richtung bleiben davor (Benutzerwahl 07.10.2026), nicht addiert. Item-Set nimmt den Offmeta-Kern, wenn diese Richtung gewählt ist.
- Link „Guides auf aramonly.com“ (`aram_open_guide`, Slug aus `name_en` von arammeta; aramonly hat rund 1 480 ARAM-Build-Seiten für 172 Champions, alle Namen außer Locke passen).
- Offen: Seite „Offmeta“ in der Mayhem-App (alle 173 Champion-Dateien, höchstens alle 6 h), danach „Build folgt den genommenen Augments“ (ROADMAP). Die frühere Idee einer Handliste für Sonderfälle ist ersetzt durch das Offmeta-System (Benutzer: „nichts von Hand pflegen“; Sonderfälle wie Full Magic Pen oder Spin to Win sind jetzt Themen-Regeln).

## Champ-Karte: alle Champion-Daten von arammeta — 08.10.2026

- Benutzerauftrag „alle Daten von arammeta in mein System und App gut einbauen, so viele Daten wie möglich“; dieser Teil: alles je Champion. Ein anderer Agent macht die Tier-Listen-/Detailseiten der Mayhem-App (`pages.tsx`, `mayhem_tiers`).
- `champCard.ts`: `parseExtra` liest `boots`, `singleItems` (top, popularBad, bot), `items` (Paare), `spells`, `bot` (schwächste Augments je Seltenheit mit `slots` = Zahlen je Wahl 1–4), `augTypes`; jeder Teil für sich streng geprüft, ein kaputter Teil bleibt leer. `metaExtra` → `ChampView.extra` (nur bei arammeta als Quelle): nutzlose Items nie als Vorschlag, Mana-Items zuletzt und markiert, „beliebt, aber schwach“ ohne die besten, Zauber nur bekannte und nie Erschöpfung/Barriere, schwächste Augments ohne die, die die Karte irgendwo S/A einstuft. Kern-Gruppen tragen Name (`label`) und spätere Items (`later`, aus `tail`). `sets` war überall leer, nicht gelesen.
- Anzeige: blank.-Popout mit Reitern Augments/Items/Zauber/Meiden unter „Dein Build“ (nicht im Spiel, dort zählt das Angebot); Mayhem-App links unter dem Kern (Stiefel, Einzel-Items, Paare, Beliebt aber schwach, Zauber, Augment-Arten, schwächste Augments), rechts die Stufenliste wie bisher; `sticky` der linken Spalte entfernt (zu lang).
- Item-Set: Kern, Block „Stiefel“ (arammetas beste, bis 3), danach die übrigen Kerne, spätere Items und Einzel-Items der Richtung (bis 12). Rust `item_set`/`aram_champ_build` nehmen `boots`.
- Zauber: Rust liest arammetas beste Paarung je Champion einmal pro Lauf (`meta_spell_of`, auch Fehler gemerkt); nur mit Schneeball, ≥ 100 Spielen, nie Erschöpfung/Barriere, sonst die feste Regel (`SPELL_EXCEPTIONS`). Blitz-Taste und „aufhören nach eigener Änderung“ wie bisher.
- `flyout.rs` `MAX_ITEM_BYTES` 64 → 128 KB: die Karte war schon bis ~61 KB groß, mit den neuen Daten bis ~70 KB (gemessen).
- Offen: Datenlizenz arammeta (ROADMAP), Test auf Windows mit echtem Client (VALIDATION).

## Mayhem-App: arammetas ganze Liste — 08.10.2026

- Benutzerauftrag „alle Daten von arammeta … so viele Daten wie möglich“, Teil Tier-Liste (ein anderer Agent macht parallel die Champ-Karte; `champCard.ts`, `ChampCardView.tsx`, `MayhemCard.tsx` hier nicht angefasst). Rust: `MetaList`/`MetaChamp`/`MetaAugment` in `aram_live.rs` lesen zusätzlich `top`, `pairs`, `comp`, Lift, Pickrate, `augCategories`, `itemLut`, `patchChanges`, `searchIndex.related.augments`; alle neuen Felder über `lenient` (falsche Form → Standardwert statt kaputter Liste, sonst fiele auch blank.'s `meta_info` aus). `mayhem_tiers` gibt das begrenzt und geprüft weiter (kein neuer Befehl, Capability-Beschreibung angepasst). Tests: `the_mayhem_pages_get_every_part_of_the_list`, `a_changed_extra_field_keeps_the_champ_cards_list`, ignoriert `the_real_list_has_every_part` (echter Abruf, lief grün).
- Frontend: `src/mayhem/tiers.ts` (Typen, strenges Lesen, `teamProfile`, `filterItems`, `itemRoles`, `championsWithAugment`, `categoryName`, `usedCategories`, `signedPoints`/`pointsChange`), neue Seiten in `src/mayhem/metaPages.tsx` (Champion-/Augment-Detail, Patch, Items), Seitenleiste + Home-Schnellreiter um Items und Patch ergänzt, Augments mit Kategorie-Filter und Pickrate. Details liegen über der Liste (Liste bleibt mit ihren Filtern versteckt darunter). Browser-Vorschau: `MOCK_TIERS` in `mock.ts`, Abzeichen „Mock“ (vorher zeigte die Vorschau „Nur in der Mayhem-App.“).
- Entscheidungen ohne Rückfrage: eigene Stufen S–D bleiben (arammeta hat OP/T1–T5 nur bei den Patch-Änderungen); `searchIndex.related` sind Champion-IDs, nicht Augments → als „Verknüpfte Champions“ angezeigt; `slots`, `skillScaling`, `prevMix` weggelassen (Bedeutung unklar); Teammodell nur in MAYHEM-BERATER.md 8a beschrieben.
- Offen: Ansicht mit echten Daten in `mayhem.exe` (VALIDATION), Größe der Antwort (~0,5–1 MB JSON über IPC), Datenlizenz (ROADMAP).

## Mayhem-App: echter Spieler und Rang — 08.10.2026

- ROADMAP „Jetzt 2“ (malte: „mache alles“). Rust `mayhem_ranks` (`aram_website.rs`, in `mayhem.rs`, `build.rs`, `capabilities/mayhem.json`): Spieler aus dem Client, dann `/api/players/<puuid>` und `/api/leaderboard` über dieselben Helfer wie blank. (`read_json`, `site_client`, `plain_id`), aber ohne die Upload-Freigabe (`enabled`), weil die Mayhem-App keine Einstellungen hat und nichts hochlädt. Antwort als JSON-Text, geprüft mit `parseBoard`/`parseProfile` aus `aramSite.ts`.
- Frontend: `src/mayhem/me.ts` (Zustände `loading`/`closed`/`failed`/`ready`, `me: null` = nicht in der Datenbank; `meView`, `ladderOf`, `curvePath`, `ago`), Adapter `readOwnRanks` in `src/adapters/aramSite.ts`. Geladen beim Öffnen/Schließen des Clients und beim Öffnen von Home/Rang, wenn älter als 2 min. Home: Hero = meistgespielter Champion (Ø Note aus den Perzentilen), letzte Spiele, Rang-Kachel mit echter MP-Kurve (Leiterstand nach den letzten 20 Spielen), Spiele, Ø Note, Rekorde (höchster Schaden, meiste Kills). Das erfundene „Ziel heute“ ist weg; stattdessen nur ohne Rang eine Einstufungs-Kachel. Rang: Rangkarte, Top 10 der Rangliste plus eigene Zeile, Matchverlauf (6 Spiele).
- Entscheidungen ohne Rückfrage: Server-Kürzel in der Rangliste weggelassen (`parseBoard` liest es nicht), statt Champion-Bild das Wappen; Zeitraum der Zahlen = alle Spiele, die das Profil liefert (Standard-Saison der Website), daher „meistgespielter Champion“ statt „diese Saison“.
- Branch auf `claude/roadmap-stand` (#66) aufgesetzt, weil „Jetzt 2“ erst dort steht. Offen: Test auf malte's PC (VALIDATION).

## Etappe 3a: genommenes Augment — 08.10.2026

- Benutzerauftrag („mache alles“). Nur Anzeige, keine Änderung an Empfehlungen (das ist 3b, braucht mehr Daten). `offers.rs`: je Spiel `taken` (zurückgesetzt in `follow`), automatisch wenn die letzte Lesung nur noch eine Karte zeigt, die vorher mit anderen da war (`taken_of`), sonst unbekannt; Ersatz per Klick (`aram_offer_taken`, Umschalten, nur Karten der aktuellen/letzten Runde; ein Klick in der Runde hat Vorrang vor der Automatik). `taken` im Ereignis `aram-offers`; Karte zeigt „Bisher: …“ und „genommen“, auch nach dem Schließen des Angebots.
- Nach dem Spiel: `record_eog` → `offers::check_taken` vergleicht mit den echten Augments, nur Abweichungen als Zeile `Augment-Erkennung` in `errors.log` (lokal). Offen: Test im Spiel (VALIDATION).

## Etappe 2b: Augments im Spiel — 08.10.2026

- Benutzerwahl (Empfehlung „Etappe 2b“; „noch keine Tests, erstmal weiter“). `src-tauri/src/aram/offers.rs`: Start bei Spielbeginn (`game_started` → `offers::follow`), Stufe aus Live Client Data, nach jedem Aufstieg Ausschnitt + Windows-OCR alle 250 ms, Spalten → Namen (Hamming ≤ 1/8, `ponytail:`-Grenze), Ereignis `aram-offers` mit Champ und gewählter Richtung (`aram_champ_build`, vorher `aram_item_set`, merkt die Wahl). Frontend: `useChampCard` zeigt die Champ-Karte mit `offer` (`offerRows`), Reroll per `updatePopout`.
- Offen: Test im Spiel (VALIDATION), Etappe 3 (genommenes Augment, Ranking danach), Anzeige in der App selbst.

## Etappe 2c: Item-Set und Beschwörerzauber — 08.10.2026

- Benutzerwahl („2.“ aus den offenen Punkten). Gebaut nur in blank.: Schalter `champItemSet`, `champSpells` (preferences, Standard aus) unter der Champ-Karte. Item-Set: beim Einrasten des Champs die vorgewählte Richtung, Klick auf eine andere Richtung in der Karte ersetzt es (`itemSetOf` in champCard.ts, Rust `aram_item_set`: GET Liste, nur „blank. …“-Sets dieses Champs ersetzen, PUT). Zauber: Rust im Ereignis-Strom (`spells_for`, `SPELL_EXCEPTIONS`), hört nach eigener Änderung des Benutzers auf.
- Annahmen, auf Windows zu prüfen (VALIDATION): Schneeball = 32 auch in Mayhem, `summonerId` aus current-summoner für den Item-Set-Pfad, Client nimmt das Set mit selbst erzeugter `uid`.
- Mayhem-App bleibt nur lesend (keine Einstellungen dort); auf Wunsch nachziehen.

## Mayhem-App als Desktop-Dashboard — 08.10.2026

- Benutzer: „es soll eine Desktop-PC-App werden, wie Blitz“, dann Vorlagen (Streaming-Dashboard, Bento-Stats) → Canvas „mayhemstats Design 2“, Seite „App UI“; „App · Home (Dashboard) ist gut“. Umgesetzt in `src/mayhem`: Seitenleiste (Home, Champ, Augments, Champions, Rang, „Bald“, Client-Status), Fenster 1280 × 820 (`tauri.mayhem.conf.json`).
- Home (`HomePage` in `pages.tsx`): Hero, Pill-Reiter, Top Augments (echt), letzte Spiele, Bento mit Rang und MP-Kurve, Zahlen, Rekorden, Ziel – alles zum Spieler ist Mock und so markiert, bis die App den Spieler aus dem Client liest (`aram_site_profile`/`aram_site_ranks` gibt es in blank. schon).
- Augments (Karten wie Blitz, nach Seltenheit, Suche, Filter Seltenheit/Stufe) und Champions (Stufen-Blöcke mit Icon-Raster, Klassen-Filter): echte Werte über Rust `mayhem_tiers` (aus arammetas `tier-list.json`, die die Champ-Karte schon 6 h hält; Felder streng geprüft, Test `tier_lists_keep_only_sound_entries`), Stufen S–D nach Siegquote mit 200 Spielen zur Mitte gezogen, Schnitt 10/20/40/20/10 % (`src/mayhem/tiers.ts`, Test). arammetas Platzhalter „[數值]“ wird „?“.
- Champ-Karte zweispaltig (links Champion, Richtung, Item-Kerne; rechts Augments).
- Geprüft: `pnpm test`/`lint`/`format:check`, `pnpm mayhem:web`, Clippy, Rust-Test, und die App mit `pnpm mayhem:dev` auf malte's PC angesehen (Home mit echten Top Augments, Augments-Seite). Offen: `mayhem.exe` (Release-Build) auf Windows, echter Spieler statt Mock.

## Mayhem-App im Design „Arena“ — 07.10.2026

- Benutzer: „Website erstmal hinten an, erst App“. `src/mayhem/mayhem.css` neu: Glow-Kachel als Wartebildschirm, Champion mit Splash-Art und Glas-Leiste samt Pillen, Build-Richtungen als Glas-Schalter, Item-Kerne und Augments als Zeilen mit Schein links (bester Kern gold, Augments in ihrer Seltenheit, Prisma eisblau statt Pink), Stufen-Buchstaben als kleine Glow-Kacheln, Kopfzeile als Glas. Weiches, gestaffeltes Hereingleiten (`.mayhem-in`, `--i`), reduzierte Bewegung = sofort da. Noten behalten ihre Datenfarben.
- Neue Schriften (OFL) selbst gehostet in `src/mayhem/fonts` (nur die App; Benutzer: „es soll nur die Mayhem-App bearbeitet werden“). ROADMAP: App-Umbau unter „Jetzt“, englische Website (fertig, wartet auf Codex) unter „Als Nächstes“.
- Geprüft: Vorschau im Browser mit erfundenen Werten (Wartebildschirm, Karte), `pnpm test`/`lint`/`format:check`, `pnpm mayhem:web`. Offen: Test in `mayhem.exe` auf Windows.

## Neues Design „Arena“ gewählt — 07.10.2026

- Drei Entwurfsrunden im Artifact „mayhemstats Design 2“ (Runde 1: Almanach, Heulende Schlucht, Chaos-Plakat; Runde 2: Arena, Augment-Rausch, Stille; dann Mix aus Arena und Augment-Rausch mit Blitz als Anregung). Benutzer: Regenbogen-Verlauf weg, Augment-Seite von Blitz „besonders gut“, Spielerseite mit Matchverlauf als Vorlage für alles, „ok gut“.
- Festgehalten in MAYHEM-DESIGN.md („Nächstes Design Arena“); gebaut wird erst nach dem Live-Gang der englischen Version (ROADMAP).

## Website englisch: Übergabe an Codex (Etappe „Englische Version“, Teil 3) — 07.10.2026

- `apps/mayhem-site/DEPLOY.md` oben: „Aktueller Auftrag: Englische Version mit Server-Filter“ mit den Live-Prüfungen. Keine Migration. Claude veröffentlicht nicht; nach Codex' Veröffentlichung live prüfen, dann den Punkt aus ROADMAP.md „Jetzt“ entfernen und hier mit Datum festhalten.
- ROADMAP: neues Design für Website und App unter „Als Nächstes“ (Benutzer: erst Englisch fertig, dann drei Entwürfe zur Wahl), App-Ausbau unter „Später“.

## Website: Server-Kürzel und Server-Filter (Etappe „Englische Version“, Teil 2) — 07.10.2026

- Server eines Spielers = Plattform seines neuesten archivierten Spiels (`archive_matches.platformId`, über `archive_participants`), als Kürzel wie im Client (`src/servers.ts`: `EUW1` → EUW, `EUN1` → EUNE, `NA1` → NA, `LA1`/`LA2` → LAN/LAS, `OC1` → OCE …; Test `siteServers.test.ts`). Uploads aus blank. haben keine Plattform; sie zählen nur, wenn dasselbe Spiel (gleiche `gameId`) im Archiv liegt. Ohne archiviertes Spiel kein Kürzel (`null`, auf der Seite nichts). Keine Migration; `serversOf` in `src/api.ts` braucht zwei Abfragen für alle.
- `/api/leaderboard` und `/api/players/<id>` haben je Spieler `server`. Rangliste und Spielerseite zeigen das Kürzel als kleines Kästchen; die Rangliste hat die Auswahl „Server“ (`?server=euw`, nur vorhandene Server mit Spielerzahl). Benutzerwahl: mit Filter zählen Platz, Top % und Verteilung innerhalb des Servers; Ränge bleiben gleich.
- Geprüft: `tests/all-players.mjs` (Archiv mit EUW1 und NA1, Kürzel in Rangliste und Profil), Rauch- und Integrationstest gegen frische lokale D1, Ansicht mit erfundenen EUW-/NA-Spielern (Filter NA: nur NA, Plätze ab 1; deutsch unter `/de/rangliste?server=euw`), `pnpm test`/`lint`/`format:check`/`build`.

## Website auf Englisch und Deutsch (Etappe „Englische Version“, Teil 1) — 07.10.2026

- Benutzerwahl: Englisch ist Standard an der Wurzel mit englischen Seitennamen (`/leaderboard`, `/records`, `/tier-list`, `/join`, `/game/<id>`, `/scoring`, `/privacy`, `/privacy/remove`), Deutsch unter `/de` mit den alten Namen (`/de/rangliste`, `/de/spiel/<id>` …). Alte deutsche Adressen an der Wurzel leiten dauerhaft auf `/de/…` weiter (`next.config.ts` `redirects`, Anfrage bleibt erhalten). `/players`, `/champions`, `/augments`, `/items`, `/api-guide` heißen gleich und sind an der Wurzel jetzt englisch.
- Aufbau ohne neue Abhängigkeit: Seiteninhalte liegen in `app/views/`, die Routen (`app/<en>/page.tsx`, `app/de/<de>/page.tsx`) exportieren sie nur. Sprache nur aus der Adresse (`app/ui/lang.ts`, Test `src/features/aram/siteLang.test.ts`); Client-Komponenten nutzen `useLang()` (`app/ui/i18n.ts`: `t('English', 'Deutsch')`, `href('/englische-adresse')`, `num`, `date`, `ago`, `season`), Server-Seiten (Wertung, Datenschutz, API-Anleitung) bekommen `lang`. `proxy.ts` setzt nur den Kopf `x-site-lang`, damit `<html lang>`, Titel und Fußzeile stimmen. Umschalter EN/DE in der Kopfzeile (`LangSwitch`).
- Neue Texte immer als Paar `t(en, de)`, Links immer als englische Adresse durch `href()`. Beschriftungen aus `src/` (Rekorde, Achsen, Tags, Rollen, Erklärungen) behalten ihr deutsches Feld (API und Tests unverändert) und haben ein englisches daneben (`titleEn`, `nameEn`, `AXES_EN`, `ROLES_EN`, `recordText`, `rankedTags(…, lang)`). Die API selbst und ihre Fehlermeldungen bleiben deutsch; die Seiten übersetzen bekannte Meldungen (`apiError` in `app/ui/data.ts`). Data Dragon lädt Champion- und Item-Namen in der Sprache der Seite; Augment-Namen kommen nur deutsch aus dem Client.
- Geprüft: Website tsc/lint/build, Rauchtest (beide Sprachen, `lang`, Riot-Hinweis, Weiterleitungen, 404) und Integrationstest gegen lokale Vorschau mit frischer D1, `pnpm test`/`lint`/`format:check`/`build`, Umschalter im Browser.
- Offen in dieser Etappe: Server-Kürzel und Server-Filter (nächster PR), Übergabe an Codex, Veröffentlichen und Live-Prüfung.

## Aufteilung großer Dateien (6): `flyout.rs` — 07.10.2026

- Reine Verschiebung wie bei `aram.rs`/`pc.rs`. `flyout.rs` (1054 → ~510 Zeilen) behält Konstanten (`KINDS`, `PLACES`, `SCREENS`, `PAGES`), `FlyoutState`, Prüfungen und alle Tauri-Befehle (`#[tauri::command]` bleibt in der Wurzel, sonst müsste `lib.rs` die erzeugten Makros anders erreichen); neu unter `src-tauri/src/flyout/`: `window.rs` (Fenster-Handle, Anzeigen ohne Fokus, Erzeugen, Rahmen), `place.rs` (Bildschirm, Taskleiste, `keep_above_taskbar`, `corner`), `tests.rs`.
- Nur `pub(super)` und `use`-Zeilen; per Zeilenvergleich geprüft.

## Aufteilung großer Dateien (5): `pc.rs` — 07.10.2026

- Reine Verschiebung wie bei `aram.rs`. `pc.rs` (1054 → ~240 Zeilen) behält Typen, Schwellen, `PcState`, `start` und die Tauri-Befehle (`pc_status`, `close_program`, `program_running`); neu unter `src-tauri/src/pc/`: `watch.rs` (Warnungen), `sampler.rs` (Messung), `programs.rs` (`PROTECTED`, Fenster/Prozesse, Windows-Helfer), `gpu.rs` (Grafikkarte), `hardware.rs` (`specs`; nicht `specs.rs`, sonst Namenskonflikt mit der Funktion), `tests.rs`.
- Nur `pub(super)`, `use`-Zeilen und Moduldoku statt der `// ---`-Abschnittskommentare; per Zeilenvergleich geprüft. `crate::pc::program_pids`/`windows` bleiben gleich.

## Aufteilung großer Dateien (4): `app.css` — 07.10.2026

- Benutzer: „mach einfach weiter“ nach den ersten drei Aufteilungen; reine Verschiebung wie bei `desktop.css`.
- `src/styles/app.css` ist nur noch die Liste der `@import`s; die 1197 Zeilen liegen unverändert in `src/styles/app/` (base, shell, cards, streams, channels, devices-pc, settings, accessibility, responsive). Import-Reihenfolge = Kaskade. Die allgemeine Bewegungs-Regel (`data-motion='off'`, reduzierte Bewegung) steht jetzt in `app/accessibility.css`.
- Geprüft: gebautes CSS vorher und nachher byte-identisch.

## Aufteilung großer Dateien (3/3): `PopoutWindow.tsx` — 07.10.2026

- Benutzerauftrag: reine Aufteilung ohne Verhaltensänderung, je Datei ein PR (vorher `aram.rs`, `desktop.css`).
- `src/features/popouts/PopoutWindow.tsx` (1400 → ~930 Zeilen) behält Warteschlange, Fenster-Steuerung und Darstellung; neu daneben: `playing.ts` (`Playing`, `fromMix`/`fromSystem`/`fromPreview`, `useCoverColor`, `clock`, `positionOf`, `nextRepeat`), `MusicPopout.tsx` (`MusicPopout`, `UpNextPopout`, Seekbar, `MiniProgress`, Cover), `PopoutCrashed.tsx` (wird aus `PopoutWindow.tsx` weiter exportiert, `main.tsx` unverändert).
- Per Zeilenvergleich geprüft: außer Import-/`export`-Zeilen nichts geändert.

## Aufteilung großer Dateien (2/3): `desktop.css` — 07.10.2026

- Benutzerauftrag: reine Aufteilung ohne Verhaltensänderung, je Datei ein PR (vorher `aram.rs`, danach `PopoutWindow.tsx`).
- `src/styles/desktop.css` ist nur noch die Liste der `@import`s; die 4001 Zeilen liegen unverändert in `src/styles/desktop/` (layout, pages, motion, start, aram, aram-result, aram-ranking, aram-group, window-fx, aram-reset-mates, edit, errors, aram-player, aram-rank, champ-card). Die Reihenfolge der Importe ist die Kaskade – neue Regeln in die passende Datei, Reihenfolge nicht ändern.
- Geprüft: das gebaute CSS (`pnpm build`) ist vorher und nachher byte-identisch.

## Aufteilung großer Dateien (1/3): `aram.rs` — 07.10.2026

- Benutzerauftrag: reine Aufteilung ohne Verhaltensänderung, je Datei ein PR (danach `desktop.css`, dann `PopoutWindow.tsx`).
- `aram.rs` (2291 Zeilen) bleibt Wurzel des Moduls (Konstanten, gespeicherte Typen, `sync`, Tauri-Befehle); neu unter `src-tauri/src/aram/`: `client.rs` (Lockfile, `Lcu`), `games.rs` (Antworten des Clients, `Summary`, `from_history`/`from_eog`, `entries`), `after_game.rs` (`league_seen`, Spielende, Karte), `validate.rs` (`quality`, `valid_entry`), `tests.rs`. `aram_live.rs`, `aram_website.rs`, `aram_archive.rs`, `aram_lcu_probe.rs` liegen unverändert daneben (`#[path]`).
- Nur Sichtbarkeit (`pub(super)`) und `use`-Zeilen kamen hinzu; per Zeilenvergleich geprüft, dass sonst nichts geändert ist. Pfade von außen (`aram::league_seen`, `aram::client_open`, Befehle) bleiben gleich.

## Mayhem-App: Funde aus dem Windows-Test — 07.10.2026

- Test auf malte's PC von `main` (678bad1): Build läuft, `mayhem.exe` startet, „Beispiel: Alistar“ mit arammeta-Zahlen (Patch 16.19), Bilder, AP/AD/Tank wechseln. Funde und Benutzerwahl („ja“ zur Empfehlung):
- arammeta hat für Alistar nur Tank-Kerne (alle mit Heartsteel), AP und AD standen bei 0 %. Neu: Richtung ohne arammeta-Kern nimmt Kern und Augments aus den Spielen der Website (`champView`, `BuildPlan.source`), die Karte nennt die Quelle darunter (`planNote`); Zahlen werden nie addiert, der Anteil auf dem Reiter bleibt arammetas. Ohne Website-Daten sagt die Karte, dass arammeta kaum Spiele der Richtung hat.
- S war rund 15 Augments lang: `TIER_PLACES` (S höchstens 5, S+A höchstens 15), nur Karte, Website-Tierliste unverändert.
- Tank-Augments standen bei AP oben: `CATEGORY_BONUS` 0.06 und `fitOf` (jede andere Richtung zählt dagegen, neutrale bleiben).
- Zweiter Start öffnete ein zweites Fenster: `mayhem.rs` `only_one` (eigener Mutex, holt das Fenster nach vorne).

## Champ-Karte: Zahlen von arammeta.com — 06.10.2026

- Benutzerwahl („mach weiter“ zu arammeta als Datenquelle): Champ-Karte in blank. und Mayhem-App nehmen zuerst arammeta.com (offene JSON im MIT-Repo Lanternko/ARAM-Mayhem-Database, `docs/api`), sonst wie bisher mayhemstats.lol. Nie gemischt; die Karte nennt „arammeta.com, Patch …“. Rust `meta_info` (aram_live.rs), Auswertung `metaView`/`parseMeta` in champCard.ts, Tests mit der echten Form (alle 173 Dateien des Repos einmal lokal gelesen, alle gültig). CSP erlaubt arammeta.com für Augment-Symbole.
- arammeta teilt Augments nicht nach Build-Richtung: Kategorie-Bonus `CATEGORY_BONUS` (Heuristik, in der Doku benannt). Builds = Kern-Gruppe (`itemClusters`) + beste Option.
- Offen: Lizenz der Daten ist nur über das MIT-Repo abgedeckt (Daten liegen im Repo); vor einer öffentlichen Version den Macher fragen. Die Website nutzt arammeta nicht (Regel: keine gemischten Quellen).

## Mayhem-App: erste Version (eigene EXE) — 06.10.2026

- Benutzerwünsche: eigene App neben blank. im Website-Look, „ganz ganz schlicht“, Champ-Karte „kein Popup, direkt in der App“. Umgesetzt als `mayhem.exe` aus derselben Crate mit eigener Config (`src-tauri/tauri.mayhem.conf.json`, `mayhem.rs`, `src/mayhem/`), Einzelheiten in MAYHEM-BERATER.md 8a. Release-Ablauf hängt `mayhem.exe` zusätzlich an.
- Nicht drin (bewusst): Popouts, Einstellungen, Rang, Rekorde, Karte nach dem Spiel, Erkennung im Spiel. Nur auf malte's Wunsch ergänzen.
- Look „Tribüne“ wie die Website (MAYHEM-DESIGN.md, Tokens und Schriften aus `apps/mayhem-site`), nur Mayhem, nichts von blank. Daten zuerst arammeta.com, sonst mayhemstats.lol (CLAUDE.md, Champ-Karte).
- Offen: Prüfung auf Windows (VALIDATION, Nachtrag Mayhem-App), echter Abruf von arammeta, Datenlizenz vor einer öffentlichen Version beim Macher erfragen.

## Website: Design „Tribüne“ nach dem Taste-Skill — 06.10.2026

- Benutzerwunsch: „Augment-Wahl“ gefiel doch nicht; die ganze Seite samt Anordnung soll nach dem Taste-Skill (Leonxlnx/taste-skill, MIT) überarbeitet werden. Dritte Entwurfsrunde im selben Artifact; ohne ausdrückliche Wahl genommen: „Tribüne“ (Empfehlung). Vorgabe in [MAYHEM-DESIGN.md](MAYHEM-DESIGN.md), gilt auch für die Mayhem-App.
- Umgesetzt: warmes Fast-Schwarz, ein Goldakzent, Bricolage Grotesque + IBM Plex Mono (selbst gehostet, OFL; Bungee/Rubik entfernt), Rundung 4–6 px, kein Leuchten/Verlaufstext/gesperrte Großbuchstaben, `.card` ohne Kasten (Linie + Abstand), Reiter mit Unterstrich. Kopfzeile einzeilig („So funktioniert's“, „API“ in die Fußzeile). Neu angeordnet: Startseite (Suche links, Podest rechts, Kennzahlen-Leiste, Spiele des Tages 1 groß + 2 klein statt Augment-Karten, Plätze 4–10), Rangliste (Verteilung oben über die Breite, Tabelle über die Breite, Hinweise darunter), Rekorde (eine Zeile je Kategorie), Spielerprofil (ohne Kopf-Kasten, Kennzahlen als Leiste), Mitmachen (Ruf links, Zahlen rechts). Gedankenstriche aus sichtbaren Texten genommen.
- Adressen, Seitennamen und Inhalte unverändert.

## Website: Design „Augment-Wahl“ (abgelöst durch „Tribüne“) — 06.10.2026

- Benutzerwunsch: weg vom typischen KI-Look (Inter, gleiche runde Karten, Schwarz mit Neon-Grün, kleine gesperrte Überschriften). Nach zwei Entwurfsrunden (Artifact „mayhemstats Designrichtungen“) gewählt: „Augment-Wahl“. Gilt auch für die geplante Mayhem-App („Design speichern“): Vorgabe in [MAYHEM-DESIGN.md](MAYHEM-DESIGN.md), Werte in `apps/mayhem-site/app/globals.css` (`:root`), beide gleich halten.
- Umgesetzt: Pflaume-Schwarz, Amethyst-Akzent, Prisma-Folie `--holo` (Marke, Prisma-Rahmen), Titel in Bungee, Text in Rubik (selbst gehostet in `public/fonts`, OFL), Favicon. Startseite: „Spiele des Tages“ als Augment-Karten (Rahmen Silber/Gold/Prisma nach Note), „Neu würfeln“ zeigt einmal die nächsten drei (`BEST_OF_DAY` jetzt 6).
- Geprüft: Build, Lint, Rauchtest, Ansicht 1280/400 px mit erfundenen Spielern auf lokaler D1 (Splash-Arts in der Sandbox gesperrt).

## Website: Tags und Vorlieben auf der Spielerseite — 06.10.2026

- Benutzerwunsch nach der Konkurrenz-Analyse („nicht Stärken, sondern Vorlieben, dazu viele Tags mit einem Wort, damit man denkt, man ist etwas Besonderes“). Stärken-Netz, Form und MP-Verlauf gab es schon und bleiben.
- `apps/mayhem-site/src/tags.ts` (rein, Test `src/features/aram/siteTags.test.ts`): 34 Tags. Die meisten markieren die besten (oder untersten) 10 % aller Spieler in einem Wert (Kills, Tode, Assists, Team-Anteil, Gold, CC/min, Turm-Schaden, Krit, absoluter Schaden, Spieldauer, Abwechslung, Notenschwankung, Prisma-Anteil und die fünf Achsen der Note); die übrigen sind Regeln (One-Trick, Skin-Sammler, Zauberer/Klingenmeister/Hybrid, Pentakill, Glückspilz/Pechvogel …). Tags erst ab 10 gewerteten Spielen, Grenzen erst ab 20 solcher Spieler; teilen sehr viele denselben Wert, gibt es den Tag nicht.
- `/api/tags` (zwischengespeichert) schickt nur Grenzwerte und Anzahlen, nie Spieler; die Seite rechnet die Werte des Spielers selbst aus seinem Verlauf. Die Spielerseite zeigt die Karte „Tags“ (seltenste zuerst, „nur 12 %“) und oben die drei seltensten statt der bisherigen Spielstil-Abzeichen (die bleiben als Ersatz unter 10 Spielen), dazu die Karte „Vorlieben“ (Champions, Klassen aus Data Dragon, Schadensart, Augments).
- Geprüft: Website tsc/lint/build, Rauchtest (prüft `/api/tags`), `pnpm test`/`lint`/`format:check`, Ansicht bei 1280 und 390 px mit 26 erfundenen Spielern auf frischer lokaler D1 (Data Dragon in der Sandbox gesperrt, Klassen und Bilder daher nicht gesehen).

## Website: Gruppen entfernt — 06.10.2026

- Benutzerwunsch „ich will keine Gruppen mehr“. Weg sind die Seite `/gruppe/<code>`, die Gruppencode-Felder (Rangliste, Rekorde, Champions, Tier-Liste, Augments/Items), `?group=` am Profil, die Endpunkte `POST /api/groups`, `/api/groups/<code>/join|leave|restart` und `GET /api/gruppe/<code>`, `src/group.ts` samt Test, die Duell-/Spielabend-CSS und `groups`/`group_members` im Export.
- Bewusst behalten: die Tabellen `groups` und `group_members` mit ihren Daten (keine Migration, nichts unumkehrbar; eine spätere Migration kann sie löschen, wenn der Benutzer das will). Löschen eines Profils entfernt weiter auch dessen Mitgliedschaften. `group` im Upload wird noch angenommen und ignoriert (blank. schickt `null`), `?group=` an Lese-Endpunkten wird ignoriert (alte Links zeigen alle Spieler, Snapshots ohne `group` im Schlüssel).
- Die blank.-App nutzt die Gruppen der Website nicht: ihre ARAM-Gruppe läuft über MQTT (`aram_group.rs`) und ist davon unberührt; der Website-Upload schickt immer `"group": null`.

## Website: „Bist du schon drin?“, „Das bin ich“ und „Deine Plätze“ — 06.10.2026

- Benutzerwunsch, um mehr Leute zum Collector zu bringen: Die Startseite fragt ganz oben „Bist du schon drin?“ mit der großen Suche. Ohne Treffer zeigt die Suche (auch die im Kopf) „… ist noch nicht in der Datenbank“ mit „Spiele hinzufügen“; Enter ohne Treffer führt ebenfalls zu `/mitmachen?name=…`, das oben einen Hinweis mit Collector-Download zeigt.
- „Login“ vorerst ohne Konto: auf jeder Spielerseite „Das bin ich“ (`app/ui/me.ts`, nur `localStorage` `mayhem.me.v1` mit öffentlicher Nummer und Riot-ID, nichts wird gesendet). Danach ist die eigene Zeile in Rangliste (dazu „Zu mir springen“), Top 10 und Rekorden markiert, und die Startseite zeigt „Deine Plätze“ (`/api/plaetze/<nummer>`, Logik `apps/mayhem-site/src/places.ts`, Test `src/features/aram/sitePlaces.test.ts`), bester Platz zuerst. Rekord-Plätze über alle Spieler (`recordRanking` in `src/records.ts`, `recordsView` schneidet wie bisher auf zehn ab).
- Echtes Anmelden mit Riot (RSO, OAuth2) ist nur mit Produktionsschlüssel möglich und wird bei Riot eigens beantragt (Riot meldet sich dann im Developer Portal). Es würde nur beweisen, wer man ist, und brächte keine Mayhem-Spiele (die Web-API gibt Queue 2400 nicht heraus). Nicht gebaut; erst nach Benutzerauftrag beantragen. Neue Texte stehen gesammelt in `ME_TEXT` (für die englische Fassung).
- Offen: #33 (Riot-ID-Adressen) war beim Bau noch nicht gemergt; die neuen Links nutzen `/players/<nummer>` wie der Rest der Seite.

## Mayhem-App: Plan und Etappe 1 Champ-Karte — 06.10.2026

- Benutzerwunsch: eine reine Mayhem-App mit Sync zur Seite, Game Card mit Rekorden, und „was wirklich Special“: Champ erkennen, Augments beim Rundenstart erkennen und den passenden Build zeigen (z. B. AP-Augment auf Alistar → Stormsurge; Mana-Items sind in ARAM schlecht).
- Befund: Champion geht (Champ-Auswahl über den Ereignis-Strom des Clients, im Spiel aus der Gameflow-Sitzung). Angebotene Augments gibt Riot über keine Schnittstelle heraus (weder LCU noch Live Client Data); OP.GG, Hexgate und offene Projekte lesen die drei Karten per Bildschirmausschnitt + Texterkennung. Riot-Regeln (Sekundärquellen, die Riot-Seite war aus der Sandbox gesperrt): Overlays mit vorab bekannten Daten und mehreren hervorgehobenen Möglichkeiten erlaubt, Ansagen nach Spielzustand, Speicherlesen und Eingabe-Automatik verboten.
- Etappen: (1) Champ-Karte in der Champ-Auswahl – dieser Stand; (2) Augment-Karten im Spiel per Windows-OCR bei Level 7/11/15, kleines Overlay mit unserer Note (braucht neue Ausnahmen: Bildschirmausschnitt, Fenster über dem Spiel); (3) 2–3 Builds je Champ + gewähltem Augment, Mana-Abzug; (4) schlanke Mayhem-App aus demselben Code, ersetzt den Collector (aus dem Thread „Collector ohne Download“: evtl. Microsoft Store, offen ob die Prüfung das Lockfile-Lesen erlaubt); (5) Anmeldung/Sync mit der Seite (eigener Thread).
- Etappe 1 umgesetzt, Regeln in CLAUDE.md (Champ-Karte). Neue Abhängigkeit `native-tls` direkt (war schon über reqwest im Lockfile, gleiche Version) für den TLS-Connector des Client-WebSockets. Auf Windows mit echtem Client noch nicht gesehen (VALIDATION).
- Hauptargument fürs Herunterladen (Benutzer, 06.10.2026): das System denkt mit. Rollt ein Augment, das den Champ umwandelt (z. B. auf AD), zeigt die App den besten Build genau dazu, merkt sich Augment und Build, und rankt die nächsten Angebote (Level 11, 15) passend zu Build und bisherigen Augments. Ausführliches Konzept: [MAYHEM-BERATER.md](MAYHEM-BERATER.md). Umsetzung: (2a, ohne Overlay) je Augment des Champs die besten Item-Kerne aus Spielen mit genau diesem Augment, und „Umwandler“ aus den Daten erkennen (Augment, mit dem sich die Item-Art des Champs deutlich verschiebt, z. B. AP→AD), Rückfall bei wenig Spielen: Champ+Augment → Augment auf Champs derselben Rolle → Augment allgemein, immer mit Spielzahl; (2b) Angebote per Windows-OCR lesen, gewähltes Augment per Klick im Overlay (später ggf. automatisch); (3) Angebote ranken nach Spielen, die die bisherigen Augments und den Kern teilen. Daten: Augmente stehen je Spiel in Slot-Reihenfolge (playerAugment1–6), Items nur als Endinventar (keine Kauf-Reihenfolge). Riot-Risiko: Empfehlungen, die auf Entscheidungen im laufenden Spiel reagieren, sind die Grauzone der Richtlinie – immer mehrere Optionen mit Zahlen, vor einer öffentlichen Version im Riot-Portal (App 887776) nachfragen.
- Nutzlose Items (Benutzerwunsch, 06.10.2026): `USELESS_ITEMS` in `champCard.ts` (Umbral Glaive 3179, Jungle-Begleiter 1101–1103, Support-Questitems 3865–3877) fliegen aus jedem Build-Vorschlag. Bewusst nicht drin: Hullbreaker und Mejais (in ARAM nicht nutzlos, nur speziell).
- Neufassung (Benutzer, 06.10.2026): Build vor dem Spiel wählen, danach alle Augments für diesen Build ranken (AP-Alistar → Stormsurge, AP-Augments S), im Spiel neue Angebote und Rerolls sofort erkennen und in der App zeigen. Timelines damit nicht nötig (nein). Etappe 2a in #41: `buildPlans` in `champCard.ts` (Richtung eines Spiels = Art der meisten fertigen Items, `kind` aus den Data-Dragon-Tags in `aram_live.rs`; Augment-Wert je Richtung = Ø Perzentil, zum allgemeinen Wert des Augments auf dem Champ gezogen; Stufen nach Platz wie die Tierliste, die Nr. 1 immer S; Umwandler = ≥ 4 Spiele, ≥ 60 % in einer Richtung, die der Champ ≤ 35 % geht). Die Wahl lebt bisher nur in der Karte; für 2b geht sie an die App zurück. Ablauf von 2b in MAYHEM-BERATER.md, Abschnitt 6.
- Entscheidung (Benutzer im Thread „Konkurrenz-Analyse“, 06.10.2026): blank. darf Item-Sets („blank. …“, eigene nie überschreiben) und Beschwörerzauber (Schneeball ~90 %, Ausnahmen wie Singed → Geist, nie Erschöpfung/Barriere) in den Client schreiben, je mit Schalter dauerhaft an/aus. Plan: MAYHEM-BERATER.md 6a, Etappe 2c. Der Konkurrenz-Thread plant den Lobby-Check auf derselben Champ-Auswahl-Verbindung.
- Idee des Benutzers (06.10.2026): Situations-Tags an Builds je Gegnerteam (Anti-Tank, Anti-Heilung, Gegen Burst), nur aus gemessenen Unterschieden mit genug Spielen und Rückblick-Test; Gegner erst beim Spielstart bekannt. MAYHEM-BERATER.md 3.8, Etappe 3.
- Benutzerwunsch (06.10.2026): eigene Mayhem-App neben blank. im Website-Look („Augment-Wahl“). Empfehlung an malte (Karte im Thread, offen): zweite App/EXE im selben Repo mit derselben Logik. MAYHEM-BERATER.md 8a.
- Datenlage: Builds je Champion brauchen Spiele; bei wenigen zeigt die Karte „Noch zu wenig Spiele“ statt zu raten.

## Open Source unter AGPL-3.0 — 05.10.2026

- Benutzerwahl: Repo `blank` (App und Website) unter AGPL-3.0-only. `LICENSE` (Originaltext der FSF), `license` in `package.json`, `apps/mayhem-site/package.json` (+ Lockfile-Wurzel) und `src-tauri/Cargo.toml`, Abschnitt „Lizenz“ am Ende der README, Fußzeile der Website „Quellcode (AGPL-3.0)“ (erfüllt § 13: Nutzer der Website kommen an den Quellcode). Fremde Teile (`vendor/`, Lucide) behalten ihre Lizenz. Nächster Benutzerwunsch: englische Fassung der Website.
- Konkurrenz-Analyse (Claude Doc „Konkurrenz-Analyse mayhemstats.lol“): nächster Konkurrent mayhemstats.com (gleicher Ansatz, Open Source, Englisch, anonym); unsere Lücke sind öffentliche Spieler mit Rang.

## Release 0.9.2 — 05.10.2026

- Auf Benutzerauftrag nach #38: Version 0.9.2 (Ränge von der Website, Rang-Schritt auf der Karte, neue Wappen, höchstens 30 MP, Freunde über Riot-ID statt PUUID). Tag `v0.9.2` erst nach dem Mergen dieses Versions-PRs und nach der Prüfung der veröffentlichten Website.

## Website: keine PUUIDs mehr, auch nicht von Hochladenden — 05.10.2026

- Benutzerentscheidung nach der Live-Prüfung: vier Hochladende standen mit echter PUUID in `/api/leaderboard` und auf ihrer Spielerseite. Jetzt steht jeder Spieler nur unter seiner öffentlichen Nummer (`a123`, Zeile in `archive_players`; fehlt sie, legt die Antwort sie an).
- Umsetzung an einer Stelle: `handle` in `apps/mayhem-site/src/api.ts` schickt jede JSON-Antwort auf GET durch `masked` (rein: `src/public-ids.ts`, Test `src/features/aram/sitePublicIds.test.ts`), der Live-Strom jede Spiel-Meldung. Werte unter `puuid` werden zur Nummer (ohne Nummer `null`), dieselbe PUUID auch an anderer Stelle. Gespeicherte Seiten (`snapshots`) bleiben unverändert und werden bei der Ausgabe maskiert, daher keine Migration. `/api/games` und `/api/export` sind damit auch ohne PUUIDs.
- Ausnahme: die PUUID, die die Anfrage selbst nennt (`/api/players/<PUUID>`, so liest blank. sein eigenes Profil), kommt als `puuid` zurück; `id` nennt immer die Nummer. Die Spielerseite leitet alte PUUID-Links auf `/players/a123` um.
- App: `aramSite.ts` `onThisPc` ordnet die Rangliste der Website den PUUIDs auf diesem PC zu (eigenes Profil über `id`, Freunde über die Riot-ID); `useSiteProfile(player)` liest Profile über die Nummer. Ältere App-Versionen zeigen den eigenen Rang weiter, bei Freunden den lokal berechneten, bis sie aktualisiert sind.
- Geprüft: `pnpm test`/`build`/`lint`, Website tsc/lint/build, lokal mit frischer D1 `tests/smoke.mjs` (zweimal), `tests/integration.mjs` (prüft jetzt: Rangliste, Spiele, Export ohne PUUID; eigenes Profil per PUUID und per Nummer), `tests/all-players.mjs`.

## Website: Mitmachen-Seite für mehr Spiele — 05.10.2026

- Benutzerwunsch „ich brauche mehr Daten“: einzige erlaubte Quelle bleiben Rohspiele (Queue 2400) aus dem League-Client der Beitragenden (Collector oder blank. mit „Hochladen erlauben“). Keine Zahlen fremder Stat-Seiten (Scraping, uneinheitlich), kein Schneeball-Crawler über fremde Spielverläufe (von der Sicherheitsprüfung der Sitzung abgelehnt, nicht gebaut).
- Neue Seite `/mitmachen` (`apps/mayhem-site/app/mitmachen/page.tsx`): Archiv-Zahlen, Collector-Download, drei Schritte (inkl. SmartScreen-Hinweis, EXE unsigniert), was der Collector liest und hochlädt (nur eigener Spielverlauf, nur Mayhem, Riot-IDs aller zehn öffentlich, Ausblenden), blank. als zweiter Weg, „Link teilen“ (Teilen-Menü oder Zwischenablage). Download-Pfade zentral in `app/ui/join.ts`.
- Hinweise darauf: „Mitmachen“ in der Navigation (Akzentfarbe), Karte „Spiele fehlen?“ auf jeder Spielerseite, Leerzustände von Champions/Augments/Items/Rekorde, Suche ohne Treffer, Archiv-Karte der Rangliste. Der Seitenkopf hat jetzt immer zwei Zeilen (neun Seiten und Suche passen nie in eine Zeile der Seitenbreite).

## Website: Statistik für Augments, Items und Champions — 05.10.2026

- Benutzerwunsch: Stats für Augments, Champions und Items (vor dem Collector ohne Download). Neue Seiten `/augments`, `/items` und je eine Einzelseite (`/augments/<id>`, `/items/<id>`): Spiele, Pickrate, Siegquote, Note Ø, sortierbar, Suche, Filter (Seltenheit bzw. Fertige Items/Stiefel/Bauteile/Alle, Einteilung aus Data Dragon `item.json`), Einzelseite mit Champions (Anteil an deren Spielen) und dem, was dazu genommen wurde. Champion-Liste und -Seite zusätzlich mit Pickrate und Siegquote, Augments mit Link und Items-Karte.
- Logik `apps/mayhem-site/src/meta.ts` (rein, Test `src/features/aram/siteMeta.test.ts`), API `/api/stats/...` (API.md), zwischengespeichert wie die Champions. Keine Migration: Items und Augments stehen in jedem Eintrag, auch im Archiv. Siegquote der Lobby-Plätze aus dem Team des Hochladenden. Siegquote und Note erst ab 5 Spielen. Die Note zählt Siege weiterhin nicht; die Siegquote steht nur daneben.
- Tier-Liste `/tierliste` (Benutzerwahl vor „Builds je Champion“): Champions, Augments, fertige Items in S–D nach Siegquote, bei wenigen Spielen zu 50 % gezogen (`PRIOR` 10), Schnitte nach Platz 10/20/40/20/10 % (`src/tiers.ts`, Test `siteTiers.test.ts`). Bewusst nicht nach Note (die ist je Champion normiert). Eigene Buchstaben in Notenfarben, keine Rang-Icons. Kopfzeile bricht jetzt unter 1320 px um (acht Seiten passten nicht). Builds je Champion (Karte „Builds“ auf der Champion-Seite): häufigste Augment-Paare und Kerne aus 3 fertigen Items, ab 2 Spielen, mit Anteil, Siegquote und Note. Der Server schickt je Spiel Augments, End-Items, Sieg und Perzentil (`builds`, ohne Namen), die Seite gruppiert (`src/builds.ts`, Test `siteBuilds.test.ts`), weil nur sie aus Data Dragon weiß, welche Items fertig sind. Kauf-Reihenfolge ist nicht gespeichert.
- Geprüft: Website tsc/lint/build, Rauchtest (erweitert um die neuen Seiten), `pnpm test`, Ansicht bei 1280 und 390 px (Data Dragon war in der Sandbox nicht erreichbar, Bilder und Item-Namen daher nicht gesehen).

## Website: Antworten müssen den Anfrage-Körper leeren — 05.10.2026

- Jede Antwort der API liest den Anfrage-Körper bis zum Ende, bevor sie rausgeht (`drain` in
  `apps/mayhem-site/src/api.ts`, aufgerufen in `handle` für jede Antwort). Ging eine Antwort raus,
  während der Körper noch ungelesen war, war die Verbindung danach kaputt: die nächste
  Schreibanfrage auf derselben Verbindung kam nie beim Worker an und bekam in der lokalen Vorschau
  „Your worker restarted mid-request“ mit HTTP 503. Lesende Anfragen fielen nicht auf, weil
  wrangler GET und HEAD selbst wiederholt.
- So fiel es auf: `node tests/integration.mjs` scheiterte beim Gruppen-Neustart, weil nur dieser
  Endpunkt seinen Körper nie gelesen hat (alle anderen POSTs rufen `body(req)` als Erstes). Gemessen
  mit 150 Paaren aus „Neustart mit falschem Schlüssel“ und einer Schreibanfrage danach: vorher 6
  Fehlschläge, nachher 0; eine Schreibanfrage, die ihren Körper liest, 0 von 150.
- Wer einen Endpunkt ergänzt, muss nichts tun; der zentrale Aufruf in `handle` deckt auch die
  frühen Fehler (403 Origin, 429, 400, 401, 404) ab, die vor dem Lesen des Körpers antworten.

## Website Etappe 7: alle Mayhem-Spieler — 04.10.2026

- Ziel des Benutzers (auch oben in `apps/mayhem-site/PLAN.md`): mayhemstats.lol ist eine öffentliche Stats- und Rangseite für alle ARAM-Mayhem-Spieler, mit Namenssuche („bin ich in der Datenbank?“). Nicht wieder auf „nur Profile“ zurückdrehen.
- Jedes archivierte Spiel ergibt zehn Einträge in `archive_entries` (`src/archive-entries.ts`, gleiche Form wie ein Upload, mit Lobby, Details, Augments), geschrieben beim Archiv-Upload (`src/archive.ts`) und für ältere Spiele bis zu 20 je Seitenaufruf (`indexPending` in `src/archive-index.ts`, aufgerufen aus `cached()` und dem Profil). `archive_indexed` merkt sich die Spiele samt `ARCHIVE_ENTRY_VERSION`; wird das Format geändert, die Version erhöhen, dann baut die Seite alles neu.
- `entries(..., withArchive = true)` in `src/api.ts` mischt Uploads und Archiv (`mergeEntries`: Upload gewinnt, außer nur das Archiv hat alle zehn). Genutzt von Rangliste, Start, Rekorden, Champions, Gruppe, Profil und den Rang-Ergebnissen; `/api/games` und `/api/export` bleiben nur Uploads.
- Spielerseiten-Adressen mit Riot-ID wie op.gg (`/players/Name-TAG`, Benutzerwunsch „sonst macht es keinen Sinn“; `profileHref` in `app/ui/data.ts`, `riotSlug`/`slugKey` in `src/hidden.ts`, `findProfile` in `src/api.ts`: Profile zuerst, sonst das neueste Archivspiel mit dem Namen). Intern und im JSON heißen Spieler ohne Profil `a<archive_players.id>` (`publicId`), nie mit PUUID; `/api/players/a123` und alte PUUID-Links gehen weiter, die Spiel-Seite verlinkt alle (`links` in `gameView`). Ausgeblendete fehlen ganz. Wer sein Profil löscht, wird zusätzlich ausgeblendet, sonst käme er aus dem Archiv unter einer Nummer zurück.
- Archiv-Einträge haben `champion: ''`; die Seiten nehmen den Champion aus Data Dragon (`championKey`/`championLabel`).
- Tests: `src/features/aram/siteArchiveEntries.test.ts`, lokal `node apps/mayhem-site/tests/all-players.mjs` nach dem Build. Migration `0006_flaky_wasp.sql` (in `DEPLOY.md`).
- Offen: Jede Seite parst alle Einträge; bei sehr vielen Spielen (deutlich über einige Tausend) wird das teuer, dann vorberechnete Ranglisten oder Seiten mit Blättern im Server. Riot-Antrag läuft noch; die öffentliche Rangliste fremder Spieler hat der Benutzer bewusst entschieden.

## Eigene Domain mayhemstats.lol — 04.10.2026

- Der Benutzer hat `mayhemstats.lol` bei Porkbun gekauft. App (`aram_website.rs`, `aram_archive.rs`), Collector (`engine.rs`), API-Anleitung, `API.md` und die Archiv-Skripte zeigen jetzt auf `https://mayhemstats.lol`. Die Website selbst nutzt nur `url.origin` und läuft unter beiden Adressen.
- Reihenfolge: Codex verbindet die Domain (`DEPLOY.md`), der Benutzer setzt die DNS-Einträge, erst wenn `https://mayhemstats.lol/api/leaderboard` antwortet, mergen und ein App-Release bauen. Die alte `*.chatgpt.site`-Adresse muss für ältere App-Versionen weiter antworten.
- Riot-Anfrage: Antragstext und Impressum-Vorlage liegen in einem Claude-Dokument des Benutzers (nicht im Repo); Product URL dort `https://mayhemstats.lol`. Riots Antwort steht noch aus.
- Riot verlangt zur Prüfung `https://mayhemstats.lol/riot.txt` mit genau dem Code aus dem Antrag (`apps/mayhem-site/public/riot.txt`, ohne Zeilenumbruch). Nicht löschen, solange der Antrag läuft; danach „Verify URL“ im Riot-Portal.

## Etappe 6 (Teil 3): Karte nach dem Spiel mit dem Rang der Website — 04.10.2026

- Die Karte (Rang-Band `RankStrip`, Popout und Dialog, auch „Ansehen“) rechnet den Schritt jetzt aus den Spielen des eigenen Website-Profils plus den Spielen auf diesem PC, die die Website noch nicht hat (`rankGames` in `aramSite.ts`; gleicher Code, gleiche Spiele, also derselbe Schritt, den die Website nach dem Upload zeigt). Ohne Profil auf der Website oder ohne Upload-Erlaubnis wie bisher lokal ab dem Gruppenstart.
- Beim Spielende nimmt `boardForCard` (`useSiteRanks.ts`) die letzte Antwort der Website, egal wie alt (neuere Spiele kommen ja vom PC), und schaut im Hintergrund neu; ohne jede Antwort ein Blick mit höchstens 3 s Wartezeit, sonst lokal.
- Test: `aramSite.test.ts` („shows on the card after a game …“): Website ohne das neueste Spiel + neuestes Spiel vom PC = Schritt aus allen Spielen. Etappe 6 ist damit fertig; Release 0.9.2 macht der Benutzer.

## Etappe 6 (Teil 2): die App zeigt die Ränge der Website — 04.10.2026

- Mit erlaubtem Website-Upload liest die App die Ränge von der Website (eine Wahrheit für alle): Rust `aram_site_ranks` (`aram_website.rs`) holt `GET /api/leaderboard` (global, laufende Rating-Saison) und das eigene Profil `GET /api/players/<eigene PUUID>`; `aram_site_profile` holt das Profil eines Spielers für den Spieler-Dialog, die App fragt nur nach Spielern, die die öffentliche Rangliste schon zeigt. Ohne Upload-Erlaubnis geht nichts an die Website und alles bleibt lokal. Antwort ≤ 16 MB, nur GET, keine Weiterleitungen, PUUID nur aus Buchstaben, Ziffern, `-`, `_`.
- Frontend: `src/adapters/aramSite.ts`, Prüfung und Zusammenführung `src/features/aram/aramSite.ts` (`parseBoard`, `parseProfile` streng; `combine`: Website für alle, die sie kennt, sonst lokal; `Ranked` statt `Standing` in Rangliste, Mein Verlauf, Spieler-Dialog und Home-Widget), Hook `useSiteRanks.ts` (gemeinsamer Stand für Home und Rang, beim Öffnen, beim Zurückkehren höchstens alle 2 min und nach bestätigtem Upload; kein Polling, nichts bei verstecktem Fenster). Rang-Seite nennt die Quelle („Ränge von der Website · Stand“, bei Fehler der Hinweis auf die lokale Rechnung).
- Folge: der Rang ist global (alle hochgeladenen Spiele der Saison), ein Neustart der App-Gruppe setzt ihn nicht mehr zurück, solange die Website antwortet. Die Karte nach dem Spiel: siehe Teil 3.
- Website: `open`/`summary` aus `src/api.ts` nach `apps/mayhem-site/src/summary.ts` verschoben (gleiches Verhalten), damit `src/features/aram/aramSite.test.ts` die App genau gegen diese Form prüft (gleicher Rang, Spiele, Form, letzte Spiele, Verlauf).
- Geprüft: `pnpm build/lint/test`, Website tsc/lint, `cargo check` und Clippy für `x86_64-pc-windows-msvc` unter Linux (Rust-Tests nur in der CI unter Windows).

## Etappe 6 (Teil 1): neue Rang-Icons in App und Website — 04.10.2026

- Der Benutzer hat die Rangrahmen F–MAYHEM geliefert (1254 px, schwarzer Hintergrund). Freigestellt (Benutzerwunsch: Hintergrund weg, keine runde Maske) mit `node server/tools/emblems.mjs <Ordner mit 01-F.png … 10-MAYHEM.png> <Ziel>`: neuer Zweig für schwarze Matte (`unmatte`): Hintergrund = fast schwarze Flächen am Rand oder größer als 0,1 % des Bildes (Löcher in Buchstaben), feine dunkle Linien der Kunst bleiben; am Rand Alpha aus der Helligkeit gegen das hellste Nachbarpixel der Kunst und Farbe durch Alpha geteilt, deshalb kein schwarzer Saum. Geprüft auf dunklem, hellem, rotem und Schachbrett-Grund und bei 48 px.
- App: `src/features/aram/emblems/*.png` ersetzt (D–MAYHEM in `TierEmblem`; F/E liegen mit, ungenutzt – Benutzer: die neuen Icons nur für Ränge, die Noten/Leistung haben eigene Icons), `mix-blend-mode: screen` an `.rank-emblem` entfällt (die Bilder sind jetzt durchsichtig).
- Website: `TierMark` zeigt das Bild aus `public/ranks/<stufe>.png` statt der Buchstaben im Stein; ohne Rang bleibt das „?“. Die Noten-Icons (`public/grades/`, alte Wappen) bleiben unverändert, wie in PLAN.md vorgesehen.
- Lokal geprüft: Rangliste, Profil, `/wertung` bei 1400 und 375 px ohne Querscrollen, alle Rang-Bilder geladen; App-Vorschau Rang/Mein Verlauf. Auf hellem Grund verlieren helle Buchstaben (D, MAYHEM) an Kontrast; App und Website sind dunkel.

## Website Etappe 5 (Abschluss): Barrierefreiheit, Rauchtest, Übergabe — 04.10.2026

- axe (WCAG 2.1 AA + Best Practice) über alle Seiten bei 1400 und 375 px mit erfundenen Daten: einziger Befund war `--faint` (3,4–3,9 : 1), jetzt `#7e8f84` (≥ 4,5 : 1 auf allen Flächen; in der hervorgehobenen Zeile der Spiel-Seite gilt `--muted`). Suchfeld hat einen sichtbaren 2-px-Fokusring. Unbekannte Adressen zeigen `app/not-found.tsx` (deutsche Karte statt Englisch ohne CSS). Danach axe ohne Befund; Tastatur-Durchlauf: jeder Halt sichtbar und benannt. Skripte nicht im Repo (Playwright + axe-core im Scratch).
- `apps/mayhem-site/tests/smoke.mjs`: jede Seite und jeder Lese-Endpunkt, leer bzw. wie die DB ist, 404/400-Fälle, dann drei erfundene Spieler in einer Gruppe (Spiele kurz nach dem Gruppenstart), Spiel-Seite gibt nur die PUUID des Spielers mit Profil heraus, am Ende gelöscht und überall weg (auch aus den gespeicherten Seiten).
- Bekannt, auch auf main: ein zweiter Lauf von `tests/integration.mjs` gegen dieselbe laufende Vorschau scheitert mit „Your worker restarted mid-request“ (wrangler/miniflare lokal). Vorschau mit frischer D1 neu starten.
- Übergabe an Codex: `apps/mayhem-site/DEPLOY.md` (Projekt-ID behalten, `public/downloads` übernehmen, Migrationen 0003–0005, Prüfungen danach). Nächste Etappe laut PLAN.md: 6 (App zeigt Ränge von der Website, dann Release 0.9.2).

## Website Etappe 5 (Teil 2): Aufräumen — 04.10.2026

- Aus der Sites-Vorlage entfernt, weil nichts sie nutzt: `components/` (shadcn), `components.json`, `examples/`, `hooks/`, `lib/utils.ts`, drei Vorlagen-SVGs, Tailwind samt `postcss.config.mjs` (die Seite hat ihr eigenes CSS ohne Tailwind) und 21 ungenutzte Pakete. Gebautes CSS ist byte-gleich (MD5 vorher/nachher geprüft).
- Bleibt: `lib/connector*`, `build/`, `scripts/` (Sites-Hosting und Vorschau brauchen sie).
- Paketname **nicht** geändert: wrangler nimmt ihn als Worker-Namen (`dist/server/wrangler.json`), ein neuer Name könnte beim Veröffentlichen eine zweite Site anlegen. Nur zusammen mit Codex beim Veröffentlichen ändern, falls gewünscht.
- Lokale Prüfung: `wrangler d1 execute` nie gegen die laufende Vorschau (der Worker startet dann mitten in Anfragen neu); erst Server stoppen, Migrationen anwenden, starten, ein paar Sekunden warten.

## Website Etappe 5 (Teil 1): Seiten zwischenspeichern — 04.10.2026

- Rangliste, Startseite, Rekorde, Champions (auch einzeln) und Gruppenseite kommen aus der neuen Tabelle `snapshots` (Migration **0005**, beim Veröffentlichen über Codex mit anwenden). Logik `apps/mayhem-site/src/snapshot.ts` (`snapshotKey`, `isFresh`, Test `src/features/aram/siteSnapshot.test.ts`), `cached()` in `src/api.ts`.
- Gültig, solange kein neues Ereignis in `events` steht (Upload, Neustart, Ausblenden, Beitritt, Löschen) und höchstens 5 Minuten (Zeitfenster der Startseite, Namens-/Symbolwechsel ohne neues Spiel). Der Ereignis-Stand wird vor dem Rechnen gelesen, ein Upload währenddessen rechnet beim nächsten Aufruf neu. Über 1,5 MB wird nicht gespeichert. Löschen eines Spielers und Ausblenden leeren die ganze Tabelle (keine alten Daten liegen herum).
- Live-Strom fragt alle 5 s statt 2 s (PLAN.md). `tests/integration.mjs` prüft, dass ein Upload die gespeicherte Rangliste sofort ersetzt.
- Spieler- und Spielseite bleiben ungespeichert (rechnen nur einen Spieler bzw. ein Spiel).

## Website Etappe 4 (Abschluss): Leerzustände und Handy — 04.10.2026

- Alle Seiten mit leerer und gefüllter lokaler D1 bei 375 px und 320 px geprüft (Skript nicht im Repo; Playwright, Breite des Dokuments gegen Fensterbreite). Behoben: Navigation und Reiter (`.tabs`) brechen auf dem Handy um, statt Einträge unsichtbar seitlich zu verschieben; „So funktioniert's“ bei 320 px (Notenreihe, versteckte Tabellenüberschrift, `.table-wrap` jetzt `position: relative`); API-Anleitung (lange Adressen brechen um); Histogramm der Stufen zeigt auf schmalen Schirmen „M“ statt „MAYHEM“; Apex-Karten nennen je Stufe ihr LoL-Gegenstück.
- „Nicht gefunden“ (Spieler, Spiel, Gruppe, Champion, ungültige ID) ist eine eigene Karte mit „Zur Startseite“/„Zur Rangliste“ (`Problem` in `app/ui/bits.tsx`, `useLive` meldet `missing` bei 404); andere Fehler mit „Neu laden“.
- Anfragelimit (30/min je IP) nur noch für Schreibzugriffe, wie in PLAN.md vorgesehen: Lesen der Seiten lief in der Prüfung nach wenigen Seitenwechseln in 429. `tests/integration.mjs` prüft beides; API.md, API-Anleitung und Datenschutzseite angepasst.
- Etappe 4 damit fertig. Nächste: Etappe 5 (Feinschliff, Snapshots, Übergabe an Codex).

## Website Etappe 4 (Teil 3): Gruppe mit Duell — 04.10.2026

- Neue Seite `apps/mayhem-site/app/gruppe/[code]/page.tsx` (Link „Zur Gruppenseite“ auf der Rangliste, sobald ein Gruppencode gesetzt ist): Rangliste der Gruppe (Zeile `app/ui/player-row.tsx`, auch auf der Startseite), Duell zweier Mitglieder (Radar beider Spieler übereinander – `Radar` hat dafür `compare` –, wer auf welcher Achse vorn liegt, Bestwerte je Rekord-Kategorie, gemeinsame Spiele mit Note Ø und „bessere Note im selben Spiel“), Spielabende (Pause über 3 h trennt; je Spieler Spiele, MP-Bilanz, beste Note; nur Einstufung = „Einstufung“).
- Endpunkt `GET /api/gruppe/<12 Zeichen>` (`src/api.ts`, `groupPage()`), reine Logik `src/group.ts` (`membersOf`, `duelOf`, `sessionsOf`), Test `src/features/aram/siteGroup.test.ts`. Nur Mitglieder ab dem Start der Gruppe, also nur Spieler mit Profil. Keine Migration.
- Lokal geprüft mit einer erfundenen Gruppe aus vier Spielern und gemeinsamen Spielen (lokale D1): 1400 px und 375 px ohne Querscrollen, unbekannter Code zeigt „Gruppe nicht gefunden“.
- Offen in Etappe 4: Leerzustände und Handy über alle Seiten.

## Website Etappe 4 (Teil 2): Startseite — 04.10.2026

- `/` ist jetzt die Startseite (`apps/mayhem-site/app/start.tsx`), die Rangliste zieht nach `/rangliste` (Navigation, „Zur Rangliste“ nach dem Ausblenden). Profile und Spiele markieren weiter „Rangliste“ in der Navigation.
- Inhalt: große Suche (die Suche im Kopf entfällt auf `/`), Kopfzahlen (Spiele, Spieler, MAYHEM-Noten der Saison), Spiele des Tages (drei beste Noten der letzten 24 h mit Splash, Link aufs Spiel), Top 10 der Rangliste, Noten der Saison als Histogramm, neue Rekorde der Woche (Platz 1 der letzten sieben Tage, höchstens vier). Ränge sind öffentlich (Benutzerentscheidung), deshalb Top 10 nach Rang.
- Endpunkt `GET /api/start` (`src/api.ts`, `start()`), reine Logik `src/start.ts` (`startView`, `freshRecords`), Test `src/features/aram/siteStart.test.ts`. Nur Spiele aus `games`, also nur Spieler mit Profil. Keine Migration.
- Lokal geprüft mit acht erfundenen Spielern (lokale D1): leer und gefüllt, 1400 px und 375 px ohne Querscrollen.

## Website Etappe 4 (Teil 1): So funktioniert's — 04.10.2026

- Neue Seite `apps/mayhem-site/app/wertung/page.tsx` (in der Navigation, „Mehr dazu“ unter „So zählt es“ auf der Rangliste): Note (fünf Achsen mit Gewicht, Champion-Vergleich, Supporter, Remake/abwesend, Seltenheit jeder Note mit Noten-Icon), Leistung Ø, Rang (Stufen mit Aufbau, Anteil, LoL-Gegenstück, MP je Spiel), MP je Spiel (Kletter-Beispiel, Aufstieg/Abstieg, Schutz), Saisons, versteckte Wertung (nie gezeigt), häufige Fragen.
- Jede Zahl kommt aus dem Rechenkern (`apps/mayhem-site/src/explain.ts`: Anteile aus `GRADES`, Gewichte aus `WEIGHTS`, Stufen-Anfänge und Seltenheit aus `rankOf`/`muOf`/`phi`, Kletter-Beispiel aus `pointsFor`, Saisonstarts aus `seasonOf`); Test `src/features/aram/siteExplain.test.ts`. Ändert sich die Wertung, ändert sich die Seite mit; nur die LoL-Gegenstücke und Texte stehen fest in der Seite.
- Keine Daten, keine API, keine Migration. Lokal geprüft: 1400 px und 375 px ohne Querscrollen, Tabelle passt auf dem Handy.
- Nächste Teile von Etappe 4 laut PLAN.md: Startseite, Gruppe mit Duell, Leerzustände, Handy.

## Website Etappe 3 (Abschluss): Namen ausblenden — 04.10.2026

- Seite `apps/mayhem-site/app/datenschutz/entfernen/page.tsx` (Link unter jeder Spiel-Seite, `?spiel=<id>` vorausgefüllt, und von der Datenschutzseite), Endpunkt `POST /api/ausblenden` `{ gameId, name }` (`src/api.ts`, `hide()`): die Riot-ID muss in diesem hochgeladenen Spiel vorkommen (Archiv, Hochladende, ihre Freunde in `with`; Tag nötig, Groß-/Kleinschreibung egal), gespeichert wird nur die PUUID in `hidden_players` (Migration 0004, beim Veröffentlichen über Codex anwenden).
- Missbrauchssicher, weil Ausblenden nur weniger zeigt: kein Identitätsnachweis nötig. Spieler mit Profil (Zeilen in `games`) werden so nie ausgeblendet (409, sie löschen mit ihrem Schlüssel). Wer selbst hochlädt, wird wieder genannt (Upload löscht die Zeile). Wieder einblenden sonst nur der Betreiber (`DELETE FROM hidden_players WHERE puuid=…`).
- Wirkung überall: `entries()` (Rangliste, Profil, Rekorde, Champions, `/api/games`), Live-Strom, Export, Spiel-Seite (`gameView(…, hidden)`: Name `null`, Werte bleiben). Logik in `src/hidden.ts`, getestet in `src/features/aram/siteHidden.test.ts` und im Integrationstest.
- Lokal geprüft (lokale D1): Integrationstest grün, Formular mit Fehler und Erfolg, 1400 px und 375 px ohne Querscrollen.

## Website Etappe 3 (Rest): Augment-Namen und -Symbole — 04.10.2026

- Quelle bleibt der League-Client (`cherry-augments.json`, wie für die App-Karten); Data Dragon hat keine Mayhem-Augments. Die App schickt nach den Spielen die Augments bestätigter Spiele mit Name, Seltenheit und Symbol an `POST /api/augments` (`aram_website.rs`: `missing_augments`, `sendable`, bestätigte IDs in `aram-website.json` → `augments`, also nur einmal). Wirkt erst mit der nächsten App-Version; bis dahin zeigt die Website die Nummer bzw. „?“.
- Website: Tabelle `augments` (Migration 0003), `src/augments.ts` (strenge Prüfung: nur echte PNG bis 24 KB/256 px, Name ohne Steuerzeichen und `<>`, nur Augments aus hochgeladenen Spielen, erster Name bleibt), `GET /api/augments`, Symbol `GET /api/augments/<id>.png` außerhalb des Anfragelimits. Spiel-Seite: Augments aller zehn aus dem Archiv (`playerAugment1–6`), sonst der Hochladenden, unter den Items; Champion-Seite: Symbol und Name. Ring in der Farbe der Seltenheit.
- Tests: `src/features/aram/siteAugments.test.ts`, Rust-Tests in `aram_website.rs` (nur unter Windows ausführbar; unter Linux nur `cargo check`/Clippy für das Windows-Ziel geprüft).
- Lokal geprüft mit erfundenen Augments und Symbolen (lokale D1): 1400 px und 375 px ohne Querscrollen, keine Konsolenfehler.

## Website Etappe 3 (Teil 3): Champions — 04.10.2026

- Neue Seiten `apps/mayhem-site/app/champions/page.tsx` (in der Navigation) und `app/champions/[name]/page.tsx`, Endpunkte `GET /api/champions` und `GET /api/champions/<Data-Dragon-Key oder ID>` (`src/api.ts`). Zeitraum und Gruppencode wie bei den Rekorden (gemeinsam in `app/ui/filters.tsx`).
- Tabelle: Spiele, Note Ø, Anteil SSS/MAYHEM, Ø Schaden/Min, Rolle; sortierbar, Suche und Rollenfilter. Gezählt wird jeder Platz eines Spiels mit den Werten aller zehn (Lobby des vollständigsten Uploads, ohne Namen), Note nach derselben Regel wie überall (`lobbyPerformances`); Remakes nicht, Spiele ohne Lobby nur als Spiel ohne Note. Unter 5 gewerteten Spielen keine Werte („wenige Daten“, `MIN_GAMES`).
- Champion-Seite: Bestenliste, Augments nach Ø Note (nicht Siegquote) und die fünf besten Spiele, nur aus hochgeladenen Spielen, also nur Spieler mit Profil; keine anderen PUUIDs. Augments erscheinen als Nummer (Namen/Symbole kennt nur die App, offen).
- Reine Logik in `apps/mayhem-site/src/champions.ts`, getestet in `src/features/aram/siteChampions.test.ts`.
- Lokal geprüft mit erfundenen Spielern (lokale D1): 1400 px und 375 px ohne Querscrollen. Data Dragon in der Prüfumgebung gesperrt, Bilder nicht im Bild gesehen. Die Konsolenmeldung „RSC prefetch setup error“ kommt von vinext-Links und erscheint genauso auf `/rekorde`.

## Website Etappe 3 (Teil 2): Rekorde — 04.10.2026

- Neue Seite `apps/mayhem-site/app/rekorde/page.tsx` (in der Navigation) und Endpunkt `GET /api/rekorde` (`src/api.ts`, `records()`): je Kategorie eine Karte in der Farbe ihrer Art (Tokens `--game-*` wie in der App), Platz 1 groß mit Splash des gespielten Skins (Standard-Splash als Ersatzebene), Krone, Wert und „Spiel ansehen“ (`/spiel/<id>?p=<puuid>`), darunter Plätze 2–10 mit Link zum Profil und zum Spiel. Zeitraum „Alle Zeiten“ (Standard) oder „Diese Saison“ (`seasonOf`), Gruppencode wie auf der Rangliste. „Neu diese Woche“ als Leiste oben (Platz 1 aus den letzten sieben Tagen) und „Neu“ an jedem Platz.
- Reine Logik in `apps/mayhem-site/src/records.ts` (`RECORDS`, `recordsView`), getestet in `src/features/aram/siteRecords.test.ts`: gleiche Kategorien, Reihenfolge und Werte wie `recordCategories`/`ranking` der App, Gleichstand = gleicher Platz, fehlende Details nie 0, keine PUUIDs aus `with`. Neue Rekord-Kategorie in der App → auch in `RECORDS` (Test schlägt sonst fehl).
- Nur Spiele aus `games` (Hochladende), also nur Spieler mit Profil; Name und Symbol aus `players`.
- Lokal geprüft mit erfundenen Spielern (lokale D1): 1400 px und 375 px ohne Querscrollen, keine Fehler in der Konsole. Data Dragon in der Prüfumgebung gesperrt, Splash und Champion-Bilder deshalb nicht im Bild gesehen.

## Website Etappe 3 (Teil 1): Spiel-Seite — 04.10.2026

- Neue Seite `apps/mayhem-site/app/spiel/[id]/page.tsx` und Endpunkt `GET /api/spiel/<gameId>` (`src/api.ts`, `game()`): Kopf mit Kills je Seite, Sieg/Niederlage, Datum, Dauer, Patch; beide Teams untereinander mit Riot-ID, Note (gleiche Regel für jeden Sitz), MVP, K/D/A, Schaden, Gold, Items; Vergleichsbalken (Schaden, Eingesteckt, Heilen & Schilde, Gold); „Warum diese Note“ mit den fünf Achsen gegen den Champion-Schnitt, Wahl per Klick auf die Note. `?p=<puuid>` hebt einen Spieler hervor (Link aus dem Matchverlauf des Profils: „Ganzes Spiel ansehen“).
- Namen aller zehn aus dem Rohdatenarchiv (R2, gzip, `participantIdentities` mit gameName/tagLine). Ohne Archiv: Werte aus dem vollständigsten Upload, Namen nur der Hochladenden und ihrer Freunde (Hinweis auf der Seite). Nur Spiele mit mindestens einem Upload; reine Archiv-Spiele bleiben unsichtbar. PUUID nur bei Spielern mit eigenem Profil (Zeilen in `games`), sonst nie.
- Reine Logik in `apps/mayhem-site/src/game.ts` (`gameView`, `seatEntry`), getestet in `src/features/aram/siteGame.test.ts` (auch: Note je Sitz = Note der Lobby-Ansicht im Profil).
- Datenschutzseite nennt die Spiel-Seiten; Entfernen eines Namens vorerst per Issue an den Betreiber (kein Mechanismus im Code). Augment-Symbole fehlen: die Website hat nur Augment-IDs, Namen und Symbole kennt nur die App.
- Lokal geprüft mit erfundenen Spielern (lokale D1 + lokales R2, ein Spiel archiviert, eins nicht): 1400 px und 375 px ohne Querscrollen. Data Dragon war in der Prüfumgebung gesperrt, Champion- und Item-Bilder deshalb nicht im Bild gesehen.

## Website Etappe 2: neue Gestaltung, Rangliste, Profil — 04.10.2026

- `apps/mayhem-site/app/globals.css` neu: Tokens (Flächen, Text, Akzent, Farbe je Note `--grade-*` und Stufe `--tier-*`), keine festen Farben in Komponenten. Kopf mit Navigation und Spielersuche (`app/ui/header.tsx`), Fußzeile mit Riot-Hinweis (eigene Formulierung).
- Rangliste (`app/ranking.tsx`): Apex-Karten (MAYHEM ab 800 MP, SSS ab 400 MP), Tabelle nach Rang oder Leistung Ø, Champions, Form (letzte 6 Noten), Verteilung als Histogramm, „So zählt es“, Mitmachen (Archiv-Zähler, Collector).
- Profil (`app/players/[puuid]/page.tsx`): Rang-Karte, MP-Verlauf der Saison mit Stufenlinien und Auf-/Abstieg, Radar der fünf Notenachsen (Abstand zum Champion-Schnitt, letzte 20), Spielstil-Abzeichen, Form, Matchverlauf zum Aufklappen auf alle zehn (Note je Sitz nach derselben Regel, MVP = beste Note), Champions-Tabelle, Saisons.
- Reine Ansichten in `apps/mayhem-site/src/insights.ts`, getestet in `src/features/aram/siteInsights.test.ts`. API: Leaderboard liefert zusätzlich `icon` und `champions` (Top 3).
- Rang-Zeichen bis zu den neuen Rang-Icons des Benutzers: Buchstaben in einer Stein-Form in Stufenfarbe (`TierMark`). Die zehn Wappen liegen als Noten-Icons in `public/grades/` (256 px); `public/emblems` entfernt.
- Namen in einem Spiel: nur Spieler aus `with` (Freunde im Spiel) und der Spieler selbst; die anderen erscheinen mit Champion-Namen, weil `lobby` keine Riot-IDs enthält (Benutzerwunsch Riot-IDs aller zehn: braucht die Rohdaten aus dem Archiv, Etappe 3).
- Lokal geprüft mit echten Spielen aus der App (nur lokale D1): Desktop 1400 px und Handy 375 px ohne Querscrollen, Integrationstest grün, Build grün.

## Website: neue Seite geplant, Etappe 1 (gleiche Wertung wie die App) — 04.10.2026

- Plan der neuen öffentlichen Website: `apps/mayhem-site/PLAN.md` (Seiten, Gestaltung, Technik, Etappen 1–6). Benutzer: Ränge sofort öffentlich, alle zehn Spieler mit Riot-ID; die heutigen zehn Wappen werden Noten-Icons, neue Rang-Icons liefert der Benutzer.
- Etappe 1: Die Website rechnet mit einer Kopie des App-Kerns (`aramRating.ts`, `aramPerformance.ts`, `aramBase.ts`, `championRoles.ts`; `node server/tools/sync-site-core.mjs`), `siteCore.test.ts` prüft Gleichheit. Alte Kopie v1 (`aramBias.ts`) entfernt. API gibt `wins`, `placed`, `climbing`, `average`, `seasons` und je Spiel die Note statt 0–10 aus; nie `hidden`. Neue Saison-Zeile `v3` entsteht beim ersten Aufruf von selbst, alte Daten bleiben. Lokal geprüft: `tests/integration.mjs` (Parität mit `standings`/`rankResult`) grün; lokale D1 vorher mit `wrangler d1 migrations apply DB --local` (temporäre Konfiguration mit `migrations_dir: drizzle`). Veröffentlichen nur über Codex/Sites.

## MP höchstens ±30 je Spiel — 04.10.2026 (RATING_VERSION 3)

- `pointsFor` begrenzt jedes Spiel auf ±30 MP (`MAX_SWING`); vorher reichten extreme Spiele weit über dem oder unter dem Rang bis ±40. Normale Spiele (±25/±20/±30 je Stufe, +27/−13 über dem Rang) bleiben gleich. Grund: Benutzer sah −40 bei Niederlagen und Siegen. Geplant: Website-Rating auf denselben Kern bringen, App holt Ränge von der Website (Schritte 2–5 im Chat-Plan; Veröffentlichen der Website nur über Codex/Sites).

## Website-Upload nur auf Klick — 04.10.2026 (Prüfung von PR #13)

- Upload (`aram_website.rs`) ist standardmäßig **aus**; erst „Hochladen erlauben“ unter den
  ARAM-Hinweisen (`AramWebsite.tsx`, sagt, was öffentlich wird) schaltet ihn ein. Grund: jede
  blank.-Installation von Freunden hätte nach dem Update ungefragt ihre Spiele samt Freunden
  hochgeladen. Wer den Upload schon eingeschaltet hatte (`aram-website.json`), behält ihn.
- Das Rohdatenarchiv sammelt nur bei erlaubtem Upload; ein Archivfehler (voll, unvollständiges
  Spiel) erscheint nur als Hinweis – vorher brach er den ganzen Ranglisten-Abgleich ab.
- Wappen auf 256 px verkleinert (je ~50 KB statt ~800 KB; Website-Kopien unverändert).

## Rangicons — 04.10.2026

Freigegebene Augment-v3-PNGs in `src/features/aram/emblems/` eingebaut, SSS ohne die zwei
schwebenden Dreiecke. Dieselben Dateien für die bestehende Website. Zehn Assets vorhanden;
die aktuelle Berechnung verwendet weiterhin acht Stufen D bis MAYHEM. F/E sind nur vorbereitet.
Keine Änderungen an MMR, Ranggrenzen, Datenbank oder Uploads. PNGs unverändert mit schwarzem
Hintergrund, 1254 × 1254 Pixel; nicht durch das alte Aufbereitungsskript laufen lassen.
Die Darstellung nutzt `mix-blend-mode: screen` für `.rank-emblem` und auf der Website für
Emblem-Bilder: Schwarz verschwindet auf den dunklen Oberflächen. Die PNG-Dateien selbst
haben weiterhin einen schwarzen Hintergrund. Generierte Freistellungsversuche wurden wegen
Artefakten bzw. eingebranntem Schachbrett verworfen und sind nicht integriert.
Vorherige Assets und betroffene Notizen vor der Änderung extern gesichert.

## Automatisches Rohdatenarchiv — 03.10.2026

Benutzerauftrag: Sicherungen zurückstellen; neue Mayhem-Matches automatisch mit vollständigen
Rohdaten auf der bestehenden Website archivieren. `aram_archive.rs` hängt an den bereits
vorhandenen Matchdetail-Abrufen: originale Antwortbytes vor der Reduktion auf Ranglisteneinträge
in einer dauerhaften Outbox im App-Konfigurationsordner sichern. Keine zusätzlichen LCU-Abfragen,
kein Crawler, keine Timeline-Abfrage und kein MMR-Umbau. Bestehende Freunde bleiben im bisherigen
Sync-Umfang; alte bereits vollständig gespeicherte Matches werden nicht nachträglich abgefragt.

Upload mit 5 Sekunden Abstand, SHA-256-Bestätigung, Wiederholungen und bestehendem Pause-Schalter.
Outbox begrenzt auf 256 MB; bei Problemen bleiben Rohdaten erhalten. Erst nach bestätigter
Archivierung wird die lokale Warteschlangendatei durch einen kleinen Beleg ersetzt. Die UI zählt
archivierte Matches und offene Archiv-Uploads getrennt von Ranglisteneinträgen. Automatische
Backups sind weiterhin nicht eingerichtet.

Privater Pilot: Archivschlüssel nur in Windows Credential Manager (`blank.aram.archive`, `import`),
nicht in Code/EXE/Frontend. `examples/configure_archive.rs` nimmt ihn einmalig über stdin entgegen
und überschreibt keinen anderen vorhandenen Schlüssel. Für weitere Nutzer ist noch eine eigene
begrenzte Berechtigungslösung nötig; den administrativen Pilotschlüssel nicht verteilen.

Native und Frontend-Prüfungen bestanden; Live-Upload eines bereits archivierten echten Matches
bestätigt, Zähler unverändert. Windows-EXE gebaut und nach ausdrücklicher Freigabe am 03.10.2026
in die vorhandene Installation übernommen und neu gestartet. Neuer Prozess mit Fenster `blank.`
antwortet; installierte EXE stimmt per SHA-256 mit dem Build überein. Echter neuer Spielabschluss
mit dieser EXE bleibt zu prüfen. Kein Commit/Push/Release.
Vorherige Quelldateien und gezielte Rücknahme liegen im Aufgabenordner `outputs/automatic-archive`.

## Isolierter LCU-Test — 02.10.2026

Auf Benutzerauftrag wurde `src-tauri/src/aram_lcu_probe.rs` ergänzt, ausschließlich über
`#[cfg(test)]` in `aram.rs` eingebunden und standardmäßig ignoriert. Nutzt das vorhandene
`Lcu::connect()` und dessen HTTP-Client; keine Produktionslogik oder Datenstruktur geändert.
Ein manueller Lauf mit sieben GETs lieferte siebenmal HTTP 200: Ein Nicht-Freund aus einem
gespeicherten Queue-2400-Spiel hatte 21 Mayhem-Spiele in seiner History. Ein zusätzliches
Mayhem-Spiel ohne den eingeloggten Account lieferte zehn PUUIDs, davon acht außerhalb des
Seed-Spiels, Teilnehmerstatistiken und eine Timeline mit 20 Frames/149 Events.
Das belegt genau einen Entdeckungsschritt, keine flächendeckende Erfassung oder Skalierbarkeit.
Rohdaten bleiben außerhalb des öffentlichen Repos. `aram.json` war nach dem Lauf bytegleich.
Wiederholung: `BLANK_LCU_PROBE_OUTPUT` auf einen neuen externen Ordner und
`BLANK_LCU_PROBE_STORE` auf die vorhandene `aram.json` setzen, dann in `src-tauri`
`cargo test --lib foreign_mayhem_history_probe -- --ignored --nocapture` ausführen.
Entfernen: Testdatei und zugehörige vierzeilige Moduldeklaration aus `aram.rs` löschen.
Kein Crawler, kein MMR-System, kein Commit, kein Push, kein Release.

Übergabe zwischen KI-Sitzungen (Claude, ChatGPT/Codex …), die an blank. weiterarbeiten. Die Regeln
stehen in `CLAUDE.md` (zuerst lesen, gilt für alle), Prüfstände in `VALIDATION.md`, Bedienung in
`README.md`. Hier steht nur, **woran gerade gearbeitet wird, was entschieden ist und was offen
ist.** Bei jedem Patch und jedem Release aktualisieren und mit hochladen (Benutzerwunsch).

Stand: 30.09.2026, Version 0.9.0 (Rang-Modus veröffentlicht).

## Gerade in Arbeit: Rang-Modus für ARAM Mayhem

Wunsch des Benutzers: echte Ränge wie in einem Ranked-Modus, später vielleicht öffentlich für alle.

**Entschieden (vom Benutzer):**

- Neufassung 04.10.2026 (Vorgaben des Benutzers): versteckte Wertung (MMR) ab Spiel 1, nie sichtbar; sichtbarer Rang erst nach 5 Spielen, Einstufung höchstens S I (= Emerald I); SSS und MAYHEM so schwer wie Grandmaster und Challenger (Apex ohne Divisionen); Note F–MAYHEM je Spiel unabhängig vom Rang; Leistungs-Wertung = Durchschnitt der Noten; Sieg/Niederlage völlig egal; alle Stats zählen (kein Platz 1–10, damit Supporter und fast gleich gute Spieler nicht bestraft werden). Stufen D, C, B, A, S, SS, SSS, MAYHEM = Iron+Bronze, Silver, Gold, Platinum, Emerald, Diamond+Master, Grandmaster, Challenger nach Seltenheit; Divisionen IV–I zu 100 MP bis SS. Riots Richtlinien verbieten Alternativen zur offiziellen Rangliste (MMR/Elo): die versteckte Wertung ist nur intern, vor einer öffentlichen Version Riot fragen.
- Immer daran denken: soll später öffentlich werden und von LoL-Spielern genutzt werden. Die Regeln
  folgen der LoL-Ranked-Referenz des Benutzers (Stand 2026); Abweichungen nur auf seine Wahl: eine
  Apex-Stufe (MAYHEM), kein Verfall, Plus/Minus aus der Note statt aus Sieg/Niederlage.
- Leistung zählt, Sieg kaum (Fun-Modus: manche Spiele sind nicht zu gewinnen). Spiel strecken,
  schnell pushen oder nichts tun darf nichts bringen.
- Wappen: der eigene SVG-Entwurf gefiel nicht. Der Benutzer lässt sie von ChatGPT malen (Kristall-
  Stil). Eingebaut als 256-px-PNGs in `src/features/aram/emblems/`, vorbereitet mit
  `node server/tools/emblems.mjs <Ordner mit 1-D.png … 8-MAYHEM.png> src/features/aram/emblems`
  (entfernt eingebranntes Schachbrett oder Magenta-Hintergrund #FF00FF, schneidet zu). D und B kamen auf Magenta nach, alle acht sind die echten Bilder. Keine
  fremden Grafiken (Riot, Overwatch, Marvel Rivals usw.) übernehmen.

**Fertig (Code im Repo, noch ohne Oberfläche):**

1. `aram.json` Version 3: je Spiel die Werte aller zehn Spieler ohne Namen/PUUIDs (`lobby` in
   `src-tauri/src/aram.rs`, Typ `AramSeat` in `src/adapters/aram.ts`), nachgeholt solange der
   Client die Spiele hat, geht über die Gruppe mit (`quality`/`gameQuality`), passt in eine
   Gruppen-Nachricht (Test).
2. Note je Spiel `src/features/aram/aramPerformance.ts`: alle Stats als Anteil der Lobby, verglichen mit dem, was der Champion üblicherweise erreicht (`aramBase.ts`, erzeugt mit `node server/tools/perf-base.ts`, Client offen, je Saison neu), stufenlos, als Perzentil → F…MAYHEM. Rang `aramRating.ts`: versteckte Wertung (`updateMmr`, Kalman), Rang erst nach 5 Spielen, MP aus dem Abstand der Note zur Erwartung des Rangs, LoL-Größen, Lücke versteckte Wertung–Rang (+27/−13), Apex-Tor (`gateOf`), Saisons. `standings()` ist deterministisch. Tests: `aramRating.test.ts`.
3. Werkzeuge in `server/tools/`: `champion-roles.mjs` (Rollen aus Data Dragon), `perf-base.ts` (Tabelle der Champions aus den Spielen des Clients), `emblems.mjs`, `check-mayhem.mjs` (Riots Web-API mit eigenem Entwickler-Schlüssel in `RIOT_API_KEY`).

4. Oberfläche: Seite „Rang“ (Unterreiter Rangliste · Mein Verlauf · Gruppe), Noten-Abzeichen (`GradeBadge.tsx`) auf der Rangliste, im Verlauf und auf der Karte nach dem Spiel, Leistung Ø; vor dem Rang nur „?“ und „Einstufung n/5".

5. Etappe 4: Rang-Band auf der Karte nach dem Spiel (`RankStrip.tsx`, auch im Popout und im Dialog), eigener
   Rang im ARAM-Widget auf Home. Wappen einzeln in `TierEmblem.tsx` (das Popout lädt nicht die Rang-Seite).

**Nächste Schritte:**

- CC-Zeit (und weitere Werte) in `AramSeat`/`aram.json` v4 aufnehmen und ins Gewicht setzen (`RATING_VERSION` 3); die Rechnung läuft bisher ohne CC.
- Kalibrierung: `SKILL_SD` (0,70) und `TAU` (0,89) stammen von nur 8 Spielern mit ≥ 8 Spielen; mit mehr Daten neu messen, die Stufen hängen daran.
- Runde „Hidden MMR“ nativ prüfen, sobald die neue Version läuft (Karte nach einem echten Spiel, Popout).
- Nachsehen: Aufstiegs-Animation und Popout-Karte mit Band nach einem echten Spiel (nativ noch nicht im Bild gesehen).

**Öffentliche Version: derzeit nicht möglich.** Geprüft am 30.09.2026 mit Entwickler-Schlüssel:
Riots Web-API (Match-V5) gibt ARAM-Mayhem-Spiele nicht heraus (Spielliste endet vor den
Mayhem-Spielen, Queue 2400 liefert 0). Ohne API kann ein Server die Spiele nicht selbst holen und
Uploads aus dem Client wären fälschbar. Riot-Login (RSO) gibt es nur mit Produktions-Schlüssel.
ChatGPT Sites (Cloudflare Workers + D1) kann keine geheimen Schlüssel und keine Hintergrund-Jobs.
Falls Riot Mayhem in die API aufnimmt: eigener Server (Cloudflare Workers + D1 + Cron), gleiche
Rechnung aus `aramRating.ts`, vorher Riot per Developer-Portal fragen.

## Sonst offen

- Design-Funde (noch nicht umgesetzt): Werkzeuge in die Seitenkopf-Zeile statt eigener Zeile
  (Twitch, ARAM, Devices), Home-Widget „Twitch Live“ schneidet die letzte Zeile ab, ARAM-Kategorie
  mit lauter 0 zeigt zweimal Platz 1, Devices-Karten mit großem Deko-Symbol statt Akku im
  Vordergrund, Musik-Karte nur für „Kein Mix aktiv“, ein paar feste Werte in `desktop.css`
  (`#fff`, feste Dauern) auf Tokens umstellen.
- Browser-Erweiterung in den Stores: Texte in `extension/STORE.md`, Bilder in `extension/store/`.
  Einreichen macht nur der Benutzer mit seinem Konto (Chrome 5 $, Opera kostenlos). Nach Freigabe
  Store-Links in README und Release-Text eintragen.

## Stolpersteine

- Keine persönlichen Daten in Code oder Doku (keine Riot-IDs, Kanäle, Geräte, Pfade des Benutzers).
- Nie API-Schlüssel ins Repo, in `VITE_*` oder in Chats; der Benutzer setzt sie selbst.
- Release nur mit `pnpm desktop:build` bauen, nie `cargo build --release` (siehe CLAUDE.md).
- `tsconfig.json` erlaubt `.ts`-Endungen in Importen, damit `node server/tools/*.ts` dieselben
  Dateien direkt ausführen kann (Node 24 entfernt Typen selbst).
- Der League-Client gibt je Spieler nur die letzten 20 Spiele heraus: was vorher nicht gespeichert
  wurde, ist später weg.

## Verlauf

- 04.10.2026: Rangsystem neu (Vorgaben des Benutzers): Note F–MAYHEM je Spiel nach Champion-Vergleich statt Plätze, versteckte Wertung (Kalman), Rang nach 5 Spielen, Apex-Tor für SSS/MAYHEM, Leistungs-Wertung; `aramBias.ts` und `mark-bias.ts` ersetzt durch `aramBase.ts` und `perf-base.ts`.

- 01.10.2026: Release 0.9.1 (Seitenleiste neu, Rang eigene Seite, Ladder nach LoL-Referenz).

- 30.09.2026 (7): Seitenleiste neu (Benutzerwunsch): Abschnitte Übersicht · ARAM (Rang, Rekorde) · Medien (Twitch, Pros, Musik) · System; Rang als eigene Seite mit Unterreitern Rangliste · Mein Verlauf · Gruppe; Rekorde mit Rekorde · Beste Spiele; eine Unterreiter-Logik für alle (`components/SubTabs.tsx`).

- 30.09.2026 (6): Ladder nach der LoL-Ranked-Referenz des Benutzers (Datei `lol-ranked-kontext.md`, nicht im Repo): MP-Größen je Tier mit Form, Überlauf beim Abstieg, Landung 75/50/25, Einstufung bis SSS III 80, drei Saisons/Jahr mit Soft-Reset, Anzeige wie op.gg (S/N, Siegquote, Platz, Matchverlauf, frühere Saisons, Kletter-Hinweis). Wahl: nur MAYHEM als Apex, kein Verfall.

- 30.09.2026: **Release 0.9.0** (Rang-Modus). Nativ geprüft: `aram.json` v3 mit allen zehn, Rang-Reiter, Karte, Home.

- 30.09.2026 (5): Etappe 4 – MP und Aufstieg auf der Karte (auch Popout), Rang im Home-Widget.

- 30.09.2026 (4): Ladder wie LoL-Ranked statt Saisonwert (Benutzerwunsch: öffentlich für LoL-Spieler, Abstieg ja): Divisionen IV–I, 0–100 MP, Auf-/Abstieg, Schutz, Einstufung; Reiter zeigt Platz, Rang, MP und MP je Spiel.

- 30.09.2026 (3): Wappen D und B durch die echten Bilder (Magenta-Hintergrund) ersetzt.

- 30.09.2026 (2): Reiter „Rang“ mit den Wappen des Benutzers (D/B Platzhalter), Werkzeug
  `emblems.mjs`, Mock-Spiele mit allen zehn.

- 30.09.2026: Store-Bilder und Opera-Teil in `extension/STORE.md`; `aram.json` v3 (Werte aller
  zehn); Mayhem-Wertung mit Tests, Rollen und Ausgleich; Riot-API-Prüfung (kein Mayhem); diese
  Notizen angelegt.

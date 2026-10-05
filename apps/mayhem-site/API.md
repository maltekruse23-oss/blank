# blank. Mayhem – API und Betrieb

Basis: https://mayhemstats.lol/api

Website: https://mayhemstats.lol

## Verbindung und Schlüssel

HTTPS-Basis: https://mayhemstats.lol/api. JSON; maximal 65.536 UTF-8-Bytes pro Schreibanfrage. Beispiele sind für PowerShell 7 mit curl.exe. In upload.json stehen echte AramEntry-Werte aus blank.; die Beispieldatei enthält ausschließlich erfundene Testwerte und darf nicht als echtes Spiel hochgeladen werden. Beim ersten Upload kann die App einen vorher sicher gespeicherten, kryptografisch zufälligen Schlüssel mit 64 Hex-Zeichen als Bearer mitsenden. Ohne Schlüssel erzeugt der Server einen und liefert playerToken einmalig zurück. Bei allen weiteren Uploads derselben player.puuid sowie join, leave und DELETE muss dieser Schlüssel mitgeschickt werden. Gruppen-restart braucht den separaten adminToken. Kein globaler Schlüssel gehört in Browser-Code oder eine veröffentlichte EXE. Diese Erstregistrierung beweist keine Riot-Identität.

```powershell
$API = "https://mayhemstats.lol/api"
$PUUID = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
$GROUP = "AbCdEf123456"
$TOKEN = "PERSOENLICHER_SCHLUESSEL"
$ADMIN = "GRUPPEN_ADMIN_SCHLUESSEL"
```

## POST /api/games

Body unverändert: entries, player und group (Code oder null). Einträge dürfen die vom Client gelesenen Freunde enthalten; player identifiziert den Uploader. group nimmt den Uploader in die Gruppe auf. Ergebnis pro Eintrag; rank ist RankResult oder null, wenn das Spiel nicht zählt. MP werden ausschließlich mit standings()/rankResult() berechnet. Der erste Antwortschlüssel muss sicher in der Desktop-App gespeichert werden.

```powershell
curl.exe -X POST "$API/games" -H "Content-Type: application/json" -H "Origin: http://tauri.localhost" --data-binary "@upload.json"
# Danach:
curl.exe -X POST "$API/games" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" --data-binary "@upload.json"
```

Beispielantwort (Zeitpunkte/IDs sind illustrativ):

```json
{
  "results": [
    {
      "gameId": 8000000000,
      "puuid": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "stored": true,
      "rank": {
        "mark": 2.8,
        "gain": null,
        "before": null,
        "after": null,
        "change": null,
        "games": 1
      }
    }
  ],
  "playerToken": "NUR_BEIM_ERSTEN_UPLOAD",
  "season": {
    "id": "v1",
    "start": 1577836800000,
    "ratingVersion": 1
  },
  "group": null
}
```

## GET /api/leaderboard?group=<code>&season=<id>

group und season sind optional. Ohne group global; Standard-Saison v1. Saisonstart v1 ist 01.01.2020, sodass bestehende App-Historien übernommen werden können. Gruppen zählen ab ihrem eigenen Start. Sortierung ist exakt diejenige von standings(). Gezählt werden alle Spieler aus hochgeladenen und archivierten Spielen (Rohdatenarchiv des Collectors), je Spieler und Spiel ein Eintrag; Spieler ohne eigenes Profil stehen dort unter einer öffentlichen Nummer (`puuid: "a123"`), nie mit ihrer PUUID, ausgeblendete gar nicht. `trackedGames` zählt hochgeladene und archivierte Spiele. Beispielantwort für einen noch leeren globalen Bestand.

```powershell
curl.exe "$API/leaderboard?season=v1"
curl.exe "$API/leaderboard?group=$GROUP&season=v1"
```

Beispielantwort (Zeitpunkte/IDs sind illustrativ):

```json
{
  "season": {
    "id": "v1",
    "start": 1577836800000,
    "ratingVersion": 1
  },
  "group": null,
  "since": 1577836800000,
  "ratingVersion": 1,
  "players": []
}
```

## GET /api/spiel/<gameId>

Ein Spiel mit allen zehn Spielern, wenn es hochgeladen oder archiviert wurde (sonst 404). Liegt das Spiel im Rohdatenarchiv, kommen die Riot-IDs aller zehn von dort (`source: "archive"`); sonst die Werte aller zehn aus dem vollständigsten Upload und Namen nur der Hochladenden (`source: "uploads"`), dazu `named` (Freunde aus den Uploads nach Champion). `puuid` ist der Link zur Spielerseite: die PUUID bei Spielern mit eigenem Profil, sonst die öffentliche Nummer (`a123`), `null` bei ausgeblendeten. Fehlende Werte (`level`, `items`) sind `null`, nie 0. `disputed` meldet widersprüchliche Uploads.

```powershell
curl.exe "$API/spiel/7000000001"
```

Antwort (gekürzt): `{ "gameId", "at", "seconds", "patch", "source", "disputed", "players": [{ "team", "championId", "champion", "name", "puuid", "win", "kills", "deaths", "assists", "damage", "taken", "mitigated", "healed", "shielded", "gold", "level", "items" }], "named": [{ "champion", "name", "puuid" }] }`

## GET /api/augments, GET /api/augments/<id>.png, POST /api/augments

Namen, Seltenheit und kleine Symbole der Augments (Data Dragon hat keine Mayhem-Augments). GET /api/augments liefert `{"augments":{"<id>":{"name","rarity","icon":true|false}}}`, das Symbol kommt als PNG von /api/augments/<id>.png (außerhalb des Anfragelimits, einen Tag im Browser zwischengespeichert). blank. schickt nach dem Upload der Spiele die Augments dieser Spiele mit dem persönlichen Schlüssel: `{"puuid","augments":[{"id","name","rarity":"prismatic|gold|silver|","icon":"data:image/png;base64,…"|null}]}`, höchstens 40 pro Anfrage, Symbol ein echtes PNG bis 24 KB und 256 px. Angenommen werden nur Augments, die in einem hochgeladenen Spiel vorkommen; der erste Name bleibt, ein Symbol wird nur ergänzt, wenn noch keins da ist. Antwort `{"have":[IDs mit Symbol]}`.

## GET /api/stats/augments, /api/stats/items, /api/stats/augments/<id>, /api/stats/items/<id>

Statistik der Augments und Items über alle gezählten Spieler-Spiele ab 8 Minuten (hochgeladen und archiviert, ausgeblendete Spieler nicht), `scope=all|season`, optional `group=<code>`. Liste: `{scope,season,group,games,entries,rows:[{id,games,pick,winRate,graded,pct,grade}]}`; `pick` ist der Anteil an `entries`, `winRate`, `pct` und `grade` sind unter 5 Spielen `null`. Einzeln: `{scope,season,group,detail:{…Zeile, champions:[{championId,champion,championName,…}], paired:[Zeilen]}}`; `pick` bei `champions` ist der Anteil an den Spielen dieses Champions, bei `paired` (Items zu einem Augment bzw. Augments zu einem Item, höchstens 12) der Anteil an den eigenen Spielen. Ohne Spiel 404. Keine Namen, keine PUUIDs.

## GET /api/rekorde

Die Rekorde: je Kategorie (gleiche Kategorien und Reihenfolge wie die Rangliste der App) die besten zehn Spieler mit dem Spiel ihres Werts. Hochgeladene, nicht umstrittene und archivierte Spiele, also alle Spieler; Spieler ohne Profil unter ihrer öffentlichen Nummer, ihre PUUIDs kommen nie vor. Optional `scope=all` (Standard, alle Zeiten) oder `scope=season` (laufende Saison, drei pro Jahr) und `group` (ab dem Start der Gruppe). Gleichstand = gleicher Platz. Bei Summen (Pentakills) ist `game` das letzte Spiel, das dazu beitrug. `fresh`: das Spiel begann in den letzten sieben Tagen. Fehlende Werte älterer Spiele zählen nie als 0; eine Kategorie ohne Wert über 0 hat keine Plätze.

```powershell
curl.exe "$API/rekorde?scope=season"
```

Antwort (gekürzt): `{ "scope", "season": { "id", "year", "number", "start" }, "group", "games", "players", "categories": [{ "id", "hue", "title", "note", "kind", "unit", "places": [{ "place", "puuid", "name", "icon", "value", "fresh", "game": { "gameId", "at", "seconds", "championId", "champion", "championName", "skin" } }] }] }`

## GET /api/start

Die Startseite: Kopfzahlen, die Top 10 der Rangliste (gleiche Form wie `players` bei /api/leaderboard), die drei besten Noten der letzten 24 Stunden, die Noten der laufenden Saison (Anzahl je Note F bis MAYHEM, ein Eintrag je Spieler und Spiel) und die Rekorde, deren Platz 1 in den letzten sieben Tagen entstand (höchstens vier, nur mit Platz 1). Alle Spieler aus hochgeladenen und archivierten Spielen, keine Gruppe; Spieler ohne Profil unter ihrer öffentlichen Nummer.

```powershell
curl.exe "$API/start"
```

Antwort (gekürzt): `{ "season", "trackedGames", "players", "seasonGames", "grades": [{ "grade", "games" }], "today": [{ "puuid", "name", "grade", "gameId", "at", "seconds", "championId", "champion", "championName", "skin", "kills", "deaths", "assists", "damage" }], "top": [...], "records": [...] }`

## GET /api/gruppe/<code>

Die Gruppenseite: die Rangliste der Gruppe (gleiche Form wie `players` bei /api/leaderboard?group=…), je Mitglied, was das Duell braucht (`radar`: die fünf Notenachsen der letzten 20 Spiele, `bests`: Bestwert je Rekord-Kategorie, nur Werte über 0, `games`: gewertete Spiele mit Note), und die letzten sechs Spielabende (Spiele mit höchstens drei Stunden Pause, je Spieler Spiele, MP-Bilanz, Einstufungsspiele und beste Note). Nur Mitglieder und nur Spiele ab dem Start der Gruppe.

```powershell
curl.exe "$API/gruppe/ABCDEFGHJKLM"
```

Antwort (gekürzt): `{ "group": { "code", "name", "since" }, "season", "players": [...], "members": [{ "puuid", "radar", "bests", "games": [{ "gameId", "at", "grade", "pct" }] }], "sessions": [{ "start", "end", "games", "players": [{ "puuid", "name", "games", "gain", "placements", "best" }] }] }`

## GET /api/players/<Riot-ID, puuid oder a123>

Rang, Saisonverlauf und fünf beste Spiele nach Note, mit den archivierten Spielen. Statt der PUUID geht die Riot-ID wie bei op.gg (`/api/players/Name-TAG`, der Tag nach dem letzten `-`, ohne Groß/Klein; zuerst Spieler mit Profil, sonst das neueste archivierte Spiel mit diesem Namen) oder die öffentliche Nummer eines Spielers ohne Profil (`/api/players/a123`); die Antwort nennt dann diese Nummer als `puuid`, `icon` und `name` aus seinem neuesten Spiel. Gehört die Nummer inzwischen einem Spieler mit Profil, kommt dessen Profil. Optional group und season wie bei der Rangliste. history enthält die unveränderten Step-Objekte mit entry, mark, gain, before, after und change; bestGames dieselbe Form. Beispiel für einen Spieler ohne wertbare Spiele.

```powershell
curl.exe "$API/players/$PUUID"
curl.exe "$API/players/${PUUID}?group=$GROUP&season=v1"
```

Beispielantwort (Zeitpunkte/IDs sind illustrativ):

```json
{
  "puuid": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "name": "Beispiel#EUW",
  "icon": 1,
  "lastSeen": 1790812800000,
  "season": {
    "id": "v1",
    "start": 1577836800000,
    "ratingVersion": 1
  },
  "group": null,
  "rank": null,
  "games": 0,
  "history": [],
  "bestGames": []
}
```

## GET /api/games?group=<code>&since=<ms>

Alle nicht beanstandeten AramEntry-Datensätze ab since, innerhalb einer Gruppe frühestens ab deren Neustart. disputed enthält betroffene Schlüssel; die App muss bereits lokal vorhandene Spiele mit diesen Schlüsseln aus der Wertung entfernen. Zum Abgleich von Qualitätsverbesserungen auch ältere Spiele erneut laden: since bezieht sich auf den Spielstart und nicht auf receivedAt.

```powershell
curl.exe "$API/games?since=0"
curl.exe "$API/games?group=$GROUP&since=1790812800000"
```

Beispielantwort (Zeitpunkte/IDs sind illustrativ):

```json
{
  "entries": [],
  "disputed": [],
  "since": 0
}
```

## POST /api/groups

Neue Gruppe startet sofort. Der zwölfstellige Code dient dem Beitritt. Der nur einmal zurückgegebene adminToken erlaubt Neustarts und gehört ausschließlich dem Gruppenverwalter.

```powershell
# group.json: {"name":"Unsere Runde"}
curl.exe -X POST "$API/groups" -H "Content-Type: application/json" --data-binary "@group.json"
```

Beispielantwort (Zeitpunkte/IDs sind illustrativ):

```json
{
  "code": "AbCdEf123456",
  "name": "Unsere Runde",
  "since": 1790812800000,
  "createdAt": 1790812800000,
  "adminToken": "EINMALIGER_ADMIN_SCHLUESSEL"
}
```

## POST /api/groups/<code>/join

Der Spieler muss bereits über einen Upload registriert sein. Kenntnis des Gruppencodes genügt zur Aufnahme, der Bearer-Schlüssel schützt die eigene Identität.

```powershell
# member.json: {"puuid":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}
curl.exe -X POST "$API/groups/$GROUP/join" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" --data-binary "@member.json"
```

Beispielantwort (Zeitpunkte/IDs sind illustrativ):

```json
{
  "code": "AbCdEf123456",
  "puuid": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "joined": true
}
```

## POST /api/groups/<code>/leave

Entfernt nur die Gruppenmitgliedschaft; Spiele und globale Wertung bleiben bestehen.

```powershell
curl.exe -X POST "$API/groups/$GROUP/leave" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" --data-binary "@member.json"
```

Beispielantwort (Zeitpunkte/IDs sind illustrativ):

```json
{
  "code": "AbCdEf123456",
  "puuid": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "joined": false
}
```

## POST /api/groups/<code>/restart

Setzt since auf jetzt für alle Mitglieder. Historische Spiele bleiben global erhalten. Nur mit Admin-Schlüssel.

```powershell
curl.exe -X POST "$API/groups/$GROUP/restart" -H "Authorization: Bearer $ADMIN"
```

Beispielantwort (Zeitpunkte/IDs sind illustrativ):

```json
{
  "code": "AbCdEf123456",
  "since": 1790812800000
}
```

## DELETE /api/players/<puuid>

Löscht Profil, eigene Spiele, Upload-Nachweise, Mitgliedschaften und personenbezogene Verweise in den with-Feldern fremder Spiele. Widersprüche werden danach neu bewertet. Alle Website-Ansichten werden über reset aktualisiert. Bereits heruntergeladene Kopien und Plattform-Backups werden nicht zurückgerufen.

```powershell
curl.exe -X DELETE "$API/players/$PUUID" -H "Authorization: Bearer $TOKEN"
```

Beispielantwort (Zeitpunkte/IDs sind illustrativ):

```json
{
  "deleted": true
}
```

## GET /api/live?group=<code>

Server-Sent Events. game enthält entry, rank und disputed. ready bestätigt die Verbindung; reset fordert vollständiges Nachladen; heartbeat hält sie offen. Der Server prüft das dauerhafte Ereignisprotokoll alle 5 Sekunden, also kein garantierter Sofort-Push. Der Stream verbindet sich nach ca. 45 Sekunden mit Last-Event-ID neu. Ereignisverweise werden 24 Stunden vorgehalten; nach längeren Ausfällen vollständig synchronisieren. Die Website nutzt bei Verbindungsfehlern automatisch 5-Sekunden-Polling. WebSocket ist hier nicht implementiert.

```powershell
curl.exe -N "$API/live"
curl.exe -N "$API/live?group=$GROUP"
# Wiederaufnahme:
curl.exe -N "$API/live" -H "Last-Event-ID: 42"
```

Beispielantwort (Zeitpunkte/IDs sind illustrativ):

```text
id: 43
event: game
data: {"entry": {"...":"vollständiges AramEntry"}, "rank": null, "disputed": true}

event: reset
data: {}
```

## GET /api/export

Zusatzendpunkt: gesamter öffentlicher Datenbestand als JSON, mit games (entry, quality, receivedAt, sourceHash, disputed), players, groups, group_members und seasons. Keine Berechtigungsschlüssel, Rate-Limit-Daten oder IP-Adressen. Der Export ist zum Archivieren und Migrieren gedacht; ein öffentlicher Import-Endpunkt ist absichtlich nicht vorhanden.

```powershell
curl.exe "$API/export" -o blank-mayhem-export.json
```

Beispielantwort (Zeitpunkte/IDs sind illustrativ):

```json
{
  "exportedAt": 1790812800000,
  "ratingVersion": 1,
  "seasons": [
    {
      "id": "v1",
      "start": 1577836800000,
      "ratingVersion": 1
    }
  ],
  "players": [],
  "groups": [],
  "group_members": [],
  "games": []
}
```

## CORS und Fehler

http://tauri.localhost und die eigene Website sind erlaubt. Native HTTP-Aufrufe aus Rust ohne Origin funktionieren ebenfalls. OPTIONS kostet kein Anfragelimit. 400: ungültiges JSON oder Eintrag mit reasons; 401: falscher/fehlender Schlüssel; 403: fremder Origin; 404: Spieler/Gruppe/Saison fehlt; 409: Versions- oder Registrierungs-Konflikt; 413: mehr als 64 KB; 429: mehr als 30 schreibende Anfragen (POST, DELETE) pro Minute/IP (Retry-After: 60); lesende Anfragen (GET) sind nicht begrenzt; 503: Speicher/Dienst vorübergehend nicht verfügbar. Bei 400 wird der Upload vor den Spieländerungen verworfen.

```powershell
curl.exe -i -X OPTIONS "$API/games" -H "Origin: http://tauri.localhost" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,authorization"
```

Beispielantwort (Zeitpunkte/IDs sind illustrativ):

```text
HTTP 204
Access-Control-Allow-Origin: http://tauri.localhost
Access-Control-Allow-Methods: GET,POST,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type,Authorization,Last-Event-ID
```

## Wertung, Konflikte und Grenzen

Die drei Originaldateien sind unverändert vom Git-Commit 7c875fd592502ed016420607a846cf0743f0e0cd übernommen. RATING_VERSION=1. Das AramEntry-Format enthält keine Queue-ID: blank. muss Queue 2400 vor dem Upload prüfen. Kein Server kann Client-Werte allein durch Bereichsprüfungen als echt bestätigen. Beim Lobby-Abgleich werden you und Reihenfolge ignoriert; alle übrigen Lobby-Werte werden verglichen. Abweichende Meldungen verschiedener Uploader schließen das ganze Spiel aus, bis deren bessere Fassungen übereinstimmen oder ein Bericht mit der Spieler-Löschung entfällt. Gleichwertige Fassungen ersetzen nichts. Wie im Original zählen auch unvollständige oder vorläufige Einträge nur, soweit markGame sie akzeptiert. Aus Sicherheitsgründen ist für eine nichtleere Lobby genau ein you erforderlich. Der originale Rust-Grenzwert gameId ist strikt kleiner als 10^13.

## Betrieb, Kosten und Änderungen

Stand 01.10.2026: Sites ist während der öffentlichen Beta in berechtigten ChatGPT-Abos enthalten. Die offizielle Sites-Dokumentation nennt 10 GB D1 pro Site; Hosting-Nutzungslimits gelten planabhängig über alle Sites. Eine verlässliche Zahl für API-Anfragen pro Tag und verbindliche Fristen bei Abo-Ende sind dort nicht veröffentlicht. Keine unbegrenzte Nutzung oder Weiterbetrieb nach Kündigung zugesichert. Bei Erreichen von Limits kann insbesondere öffentliche Erreichbarkeit eingeschränkt werden. Das eigene API-Limit beträgt 30 Anfragen je Kalenderminute und IP. Rangberechnung und Export lesen die relevanten Spiele vollständig; Rangliste, Startseite, Rekorde, Champions und Gruppenseite kommen aus gespeicherten Ergebnissen (Tabelle snapshots, Migration 0005), die jede Änderung mit Ereignis (Upload, Neustart, Ausblenden, Beitritt, Löschen) sofort ungültig macht; Namens- oder Symbolwechsel ohne neues Spiel und die Zeitfenster (Spiele des Tages, Rekorde der Woche) erscheinen spätestens nach 5 Minuten. Löschen und Ausblenden leeren alle gespeicherten Ergebnisse; sehr große Bestände können vor Erreichen von 10 GB an Laufzeit-/Speichergrenzen stoßen. Seitenänderungen hier im Chat oder über Sites > diese Website > Bearbeiten; gespeicherte Daten bleiben bei normalen Code-Updates erhalten. Bei einer neuen Rating-Version muss eine neue Saison samt passendem Originalcode eingeführt werden. Quellcode und JSON-Export ermöglichen einen späteren Umzug. Quellen: https://learn.chatgpt.com/docs/sites und https://learn.chatgpt.com/docs/pricing.
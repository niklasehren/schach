# Schach-Trainings-App – Plan

Stand: 13. November 2026 · Status: Blöcke 0–2, 4–8, 10 (Lichess-Puzzles), 12 (Brettpartien eintragen) und 13 (Konten + Synchronisierung) fertig, App fürs iPhone installierbar (PWA), Design „Klubhaus“ mit shadcn/ui; als Nächstes: Block 9 (Statistik)

## 1. Idee in einem Satz

Meine Partien (vor allem von Chess.com, aber auch in der App gegen Stockfish gespielte) werden gespeichert und automatisch analysiert, und aus meinen eigenen Fehlern entstehen Puzzles, die ich mit Wiederholung trainiere – ein persönlicher Schachberater.

```
Spielen  →  Speichern  →  Analysieren  →  Puzzles aus Fehlern  →  Wiederholen
   ↑                                                                    │
   └──────────────────── besser spielen ←───────────────────────────────┘
```

---

## 2. Technik (Entscheidungen)

| Baustein | Wahl | Warum / Erklärung |
|---|---|---|
| Grundgerüst | **Vite + React + TypeScript** | Vite = Werkzeug, das den Code bündelt und lokal einen Vorschau-Server startet. React = Bibliothek für Oberflächen aus Bausteinen („Komponenten“). TypeScript = JavaScript mit Typprüfung, fängt viele Fehler schon beim Schreiben ab. Sehr verbreitet, viel Hilfe im Netz. |
| Schachregeln | **chess.js** (v1.4) | Prüft legale Züge, Matt, Patt, Remis-Regeln, liest/schreibt PGN und FEN. |
| Brett | **chessground** (`@lichess-org/chessground`, v10) | Das Brett von Lichess: flüssig, Drag & Drop und Tippen, sehr gut auf dem Handy, Pfeile für „bester Zug“. GPL-Lizenz – passt, weil das Repo wegen Stockfish ohnehin GPL ist. |
| Engine | **Stockfish 19 „lite single-threaded“** (npm-Paket `stockfish` v19.0.1, ca. 1,7 MB) | Läuft als WebAssembly (= schneller, kompilierter Code im Browser) in einem Web Worker (= Hintergrund-Prozess, damit die Oberfläche nicht ruckelt). |
| Datenspeicher | **IndexedDB über Dexie.js** | IndexedDB = Datenbank im Browser, Daten bleiben auf dem Gerät. Dexie macht die Bedienung einfach. |
| Homescreen-App | **vite-plugin-pwa** | PWA = „Progressive Web App“: Webseite, die man aufs Handy installieren kann und die auch offline startet. |
| Hosting | **GitHub Pages** (kostenlos, öffentliches Repo) | Automatische Veröffentlichung bei jedem Hochladen über GitHub Actions (= automatisierte Abläufe bei GitHub). |
| Konten & Sync | Supabase (Gratis-Plan, Frankfurt) | Konten nur mit Einladung, Synchronisierung zwischen Geräten (Abschnitt 5b). Später: Rangliste für die Freundesgruppe. |

### Geprüft: Welche Stockfish-Version läuft ohne Server-Header? Brauchen wir Vercel?

Quelle: README des npm-Pakets `stockfish` v19.0.1 (Stockfish.js von Nathan Rugg, wird auch von Chess.com eingesetzt), abgerufen am 9.11.2026.

| Variante | Größe | Mehrere Kerne | Braucht Spezial-Header |
|---|---|---|---|
| Full | ≈ 94 MB | ja | ja |
| Full, single-threaded | ≈ 94 MB | nein | nein |
| Lite | ≈ 1,6 MB | ja | ja |
| **Lite, single-threaded** | **≈ 1,7 MB** | nein | **nein** |

- Die Mehrkern-Varianten brauchen die Header `Cross-Origin-Opener-Policy` und `Cross-Origin-Embedder-Policy` (Sicherheits-Einstellungen, die der Server mitschicken muss). GitHub Pages kann das nicht, Vercel schon.
- **Ergebnis:** Wir nehmen **Lite, single-threaded**. Läuft auf jedem statischen Hosting, auch iPhone (ab iOS 16) und Mac. Laut README ist sie schwächer als die Vollversion, aber „weit stärker als jeder Mensch“ – für Gegner und Fehleranalyse reicht das klar.
- **Vercel ist also nicht nötig.** Falls die Analyse später zu langsam ist, können wir auf Vercel + Mehrkern-Lite wechseln, ohne die App umzubauen (nur Engine-Datei + Header-Konfiguration).

### Spielstärke einstellen

- Ab einer Mindest-Elo: `UCI_LimitStrength` + `UCI_Elo`. **Geprüft (9.11.2026):** Stockfish 19 Lite meldet selbst die Spanne **1320–3190**.
- Darunter: `Skill Level` 0–20 (0 = sehr schwach). In der Oberfläche ein einziger Regler: „Einsteiger 1/4–4/4“ (Skill 0/3/6/9, ohne Elo-Angabe, weil Stockfish dafür keine nennt), dann Elo 1320 … 3000.
- Gegner bekommt eine kurze, feste Bedenkzeit pro Zug (z. B. 0,3–1 s, plus kleine Zufallsschwankung), damit er sich natürlich anfühlt und nicht die eigene Uhr verbraucht.

---

## 3. Analyse – wie die App Fehler erkennt

Nach der Partie läuft Stockfish im Hintergrund über jede Stellung (Ziel: Tiefe ca. 14–16, mit Fortschrittsbalken). Die Analyse wird gespeichert, also nur einmal gerechnet.

| Merkmal | Regel |
|---|---|
| **Bewertung pro Zug** | Engine-Bewertung vor und nach meinem Zug, umgerechnet in **Gewinnchance** (Formel wie bei Lichess). Vorteil: ein Fehler bei +8 zählt weniger als bei ±0. |
| **Ungenauigkeit / Fehler / Patzer** | Exakt wie Lichess (siehe Kasten unten): Verlust ≥ 0,1 / 0,2 / 0,3 auf der Skala −1 bis +1, also **≥ 5 / 10 / 15 Prozentpunkte** Gewinnchance. |
| **Spielphase** | Eröffnung: bis Zug 10–12 bzw. solange wenig getauscht ist. Endspiel: wenig Material übrig (z. B. Damen weg und ≤ 2 Leichtfiguren/Türme je Seite). Genaue Schwellen justieren wir an echten Partien. |
| **Figur eingestellt** | Nach meinem Zug gewinnt der Gegner mit der besten Antwort (kurze Engine-Variante) mindestens 2 Bauerneinheiten Material, und es war ein Fehler/Patzer. |
| **Matt übersehen** | Vor meinem Zug hatte ich ein erzwungenes Matt, danach nicht mehr. |
| **Matt zugelassen** | Nach meinem Zug hat der Gegner ein erzwungenes Matt. |
| **Zeitnot** | Restzeit < 10 % der Grundzeit (bei 15+10: unter 1:30). Auswertung: Fehlerquote in Zeitnot vs. sonst. |

**Geprüft: Lichess-Werte** (Quelle: Lichess-Quellcode `lichess-org/lila`, Dateien `modules/tree/src/main/Advice.scala` und `ui/lib/src/ceval/winningChances.ts`, Stand master am 9.11.2026)

- Gewinnchance = `2 / (1 + e^(−0,00368208 × cp)) − 1`, Wertebereich **−1 bis +1** (cp = Bewertung in Hundertstel-Bauern, vorher auf ±1000 begrenzt).
- Schwellen auf dieser Skala: **0,3 Patzer, 0,2 Fehler, 0,1 Ungenauigkeit**. Umgerechnet auf 0–100 % sind das **15 / 10 / 5 Prozentpunkte** (deine Vermutung stimmt).
- Matt-Sonderregeln:
  - **„Matt zugelassen“**: Patzer. Wenn ich vorher schon bei −7 bis −10 stand, ist es ein Fehler, darunter nur eine Ungenauigkeit.
  - **„Eigenes Matt verloren“**: Patzer. Wenn ich danach noch über +7 stehe, ist es ein Fehler, über +10 nur eine Ungenauigkeit.
- Diese Regeln übernehmen wir 1:1.

### Umsetzung Block 5 (Stand 12.11.2026)

- **Engine-Einstellung: feste Tiefe 16.** Gemessen an 5 echten Rapid-Partien (je ~60 Stellungen) im Browser am Mac:

  | Einstellung | Chrome | Safari-Engine | erreichte Tiefe |
  |---|---|---|---|
  | Tiefe 14 | 2,1 s/Partie | 1,9 s | 14 |
  | **Tiefe 16** | **8,8 s/Partie** | **7,8 s** | 16 |
  | 0,3 s pro Stellung | 17,4 s/Partie | 17,4 s | ~26 |

  Echtbetrieb: 10 Partien in 90 s → ~100 Partien in ~15 min (Mac). Feste Tiefe statt fester Zeit, weil dann Mac und Handy **dieselben** Ergebnisse liefern. Handy-Größe im Test mit CPU-Drosselung ergab Mac-Werte (Drosselung wirkt nicht auf den Engine-Worker) → echte iPhone-Zeit zeigt die App selbst an („Bisher x s pro Partie auf diesem Gerät“). Erwartung: 1,5–3× langsamer.
- Gewinnchance, Klassen und Matt-Sonderregeln 1:1 wie oben (`src/analysis/rules.ts`, mit Tests). Mattsetzen selbst zählt nicht als „Matt übersehen“.
- **Figur eingestellt:** Fehler/Patzer **und** nach der Engine-Variante (bis 4 Halbzüge: Gegner – ich – Gegner – ich) habe ich ≥ 2 Bauerneinheiten weniger als vor meinem Zug. Erfasst auch Gabeln; ein Abtausch zählt nicht. Beispiel: 6. g4?? ist Patzer, aber Stockfishs beste Antwort Lxc2 gewinnt nur einen Bauern → kein „Figur eingestellt“.
- **Phase:** Endspiel = keine Damen und je Seite ≤ 2 Leichtfiguren/Türme, oder insgesamt ≤ 4 Figuren (ohne Könige/Bauern). Eröffnung = bis Zug 12, solange höchstens 2 Figuren vom Brett sind. Sonst Mittelspiel.
- **Zeitnot:** Restzeit **vor** dem Zug < 10 % der Grundzeit aus dem TimeControl-Header. Daily/Fernschach und App-Partien (noch ohne Uhr) → „nicht bestimmbar“. Zeitklasse wird mitgespeichert.
- Gespeichert pro Partie: Bewertung jeder Stellung (für die Kurve in Block 6), meine Züge und die des Gegners getrennt nach Farbe, Zusammenfassung je Seite, Rechenzeit. Zwischenstand alle 4 Stellungen → nach Neuladen geht es weiter.
- Warteschlange: eine Partie gleichzeitig, neueste zuerst, neue Partien automatisch, Pause/Weiter (bleibt nach Neuladen), pausiert automatisch während einer Partie gegen den Computer. Läuft nur bei geöffneter App.
- Gegen Freund: beide Seiten werden markiert, da keine eigene Farbe bekannt ist.

### Umsetzung Block 6 (Stand 12.11.2026)

Ziel: Fehler am Brett verständlich machen, nicht nur als Text. Anlass: 7. Df1?? (besser 7. Lxc6+ – Zwischenzug mit Schach, danach 8. Dxc6+; ohne Folgezüge nicht zu verstehen).

- **Pfeile:** In der Stellung **vor** einem markierten Zug: rot = gespielt, grün = besser (kräftige Pinsel, auch am Handy gut sichtbar). Die Stellung nach dem Zug verweist darauf zurück.
- **Beste Fortsetzung:** Engine-Hauptvariante (bis 6 Halbzüge) am Brett, Schritt für Schritt (‹ ›, Pfeiltasten, Esc), der nächste Zug als Pfeil; gestrichelter Rahmen, Hinweis „Variante (Engine) – nicht gespielt“, Knopf „Zurück zur Partie“. Die Variante war seit Block 5 gespeichert; ist sie kürzer als 4 Halbzüge, werden nur die Fehlerstellungen nachgerechnet und gespeichert.
- **Erklärungen** (`src/analysis/explain.ts`, regelbasiert, nur nachprüfbare Aussagen): Schach; Zwischenzug (eigene bedrohte Figur ist nach meinem nächsten Variantenzug nicht mehr angegriffen – per chess.js geprüft); Schlagen; Materialbilanz der Variante („gewonnen“/„zurück“); beste Antwort des Gegners schlägt eine Figur (+ „ungedeckt“, wenn wirklich ungedeckt); Gabel (nur echte Bedrohungen: König, ungedeckt oder wertvoller als der Angreifer); hängende Figuren; Matt zugelassen/übersehen mit Zuganzahl. Passt keine Regel: nur Variante und Gewinnchance.
- **Sprache der Erklärungen (Überarbeitung 12.11.):** einfache Sätze, Kernaussage zuerst; Figuren ausgeschrieben, Notation nur in Klammern, keine Zugfolgen im Text (dafür „Beste Fortsetzung zeigen“). Höchstens 2 Punkte je Abschnitt, keine Doppelungen (Gabel + Schlagen = ein Satz; steht ein Matt im Raum, entfallen Material-Sätze). Fachbegriffe fett, beim ersten Vorkommen kurz erklärt, antippbar (Erklärung erscheint darunter – auch am Handy). Wörterbuch: ungedeckt, Zwischenzug, Gabel, hängende Figur, erzwungenes Matt, Mattdrohung, Fesselung, Spieß, Abzugsangriff (die letzten drei bisher nur im Wörterbuch, noch ohne Erkennungsregel). „Einen **weiteren** Bauern“ nur, wenn vor dem Zug schon Material fehlte. Fester **Merke-Satz** je Regel (`MERKE` in `explain.ts`), Vorrang: Matt > Zwischenzug > Gabel > ungedeckt > hängend > Schlagen > Schach > Material.
- **Gewinnchance in Worten** (aus Sicht des Ziehenden, 0–100 %): ≥ 92 gewonnen · ≥ 80 deutlich besser · ≥ 65 klar besser · ≥ 55 leicht besser · 45–55 ausgeglichen · ≥ 35 leicht schlechter · ≥ 20 klar schlechter · ≥ 8 deutlich schlechter · darunter verloren. Ungefähr: ±0,5 Bauern = ausgeglichen, ±1,5 = leicht, ±4 = klar, ±7 = deutlich.
- **Weitere Regeln (12.11., nach Durchsicht echter Partien):**
  - **Drohung übersehen** (erster Punkt nach Matt): Der letzte gegnerische Zug greift eine meiner Figuren an (ungedeckt oder von einer billigeren Figur) und mein Zug löst das nicht – mit Hinweis, wenn mein Zug sogar die Deckung wegnimmt. Merke: „Schau nach jedem Zug des Gegners zuerst: Was greift er an?“
  - **Schach/Schlagzug bringt nichts:** Mein Zug gibt Schach oder schlägt, aber die beste Antwort greift eine meiner Figuren an oder eine alte Drohung bleibt. „Geht verloren“ nur, wenn die Engine-Variante die Figur wirklich schlägt, sonst „bleibt angegriffen“.
  - **Hängende Figur** = angegriffen und ungedeckt **oder** von einer weniger wertvollen Figur angegriffen; der Text nennt den Fall.
  - **Besserer Zug rettet / deckt:** zieht die bedrohte Figur auf ein sicheres Feld und/oder deckt etwas, das sonst (oder nach meinem Zug) ungedeckt war – beides in einem Satz.
  - Allgemeiner Material-Satz nur, wenn keine konkrete Regel passt und die Fortsetzung wirklich mehr Material bringt als mein Zug.
  - **Merke-Satz widerspricht nie dem gespielten Zug** (z. B. kein „gib Schach“, wenn ich gerade Schach gegeben habe).
- **Automatischer Import:** Mit gespeichertem Namen holt die App beim Öffnen und beim Zurückkehren in den Tab (höchstens alle 10 Minuten) leise den aktuellen und letzten Monat; Meldung nur bei neuen Partien, Schalter auf der Import-Seite (Standard: an). Chess.com speichert die Monatsliste laut Server-Angabe nur 5 s zwischen; eine beendete Partie erscheint in der Regel nach wenigen Minuten (genaue Verzögerung nicht gemessen).
- **Bewertungsbalken** links am Brett, **Bewertungskurve** unter der Zugliste (Gewinnchance Weiß, Fehler als Punkte, Tooltip, Klick springt zum Zug), Bewertungszahl darüber.
- **Zum ersten Fehler / Nächster Fehler** (Fehler und Patzer, ohne Ungenauigkeiten).
- Markierungsfarben mit dem Paletten-Prüfer abgestimmt: Patzer rot, Fehler orange, Ungenauigkeit **blau** (gelb/orange waren bei Rot-Grün-Schwäche kaum zu unterscheiden); zusätzlich immer ??/?/?!.

Ansicht: Brett + Zugliste zum Durchklicken (auch per Pfeiltasten / Wischen), Bewertungskurve, farbige Markierung der Fehler, Pfeil für den besten Zug, kurze Zusammenfassung oben („2 Patzer, 1 Figur eingestellt, 3 von 4 Fehlern in Zeitnot“).

## 4. Puzzles aus eigenen Fehlern

### Umsetzung Block 7 (Stand 12.11.2026)

- Ein Puzzle entsteht aus der Stellung **vor** jedem meiner Fehler und Patzer – automatisch, sobald eine Partie analysiert ist (auch nachträglich für schon analysierte Partien). Übersprungen: Stellungen mit Gewinnchance unter 10 % (war schon verloren) und doppelte Stellungen (gleiche FEN ohne Zugzähler).
- **Richtig:** der beste Zug und jeder Zug mit höchstens **3 Prozentpunkten** weniger Gewinnchance (geprüft mit Stockfish in derselben Tiefe). Begründung: deutlich unter der Grenze für eine Ungenauigkeit (5 Punkte), lässt aber Spielraum für das Rauschen der Engine. Matt setzen ist immer richtig.
- **Taktik über mehrere Züge:** Ist der beste Zug forcierend (Schach, Schlagen) oder führt er zu Matt, geht die Lösung weiter, solange meine Züge forcierend sind (höchstens 3 eigene Züge, bei Matt bis zum Matt); der Computer antwortet jeweils mit dem Zug der Engine-Variante. Ruhige beste Züge: nur ein Zug.
- Kein Hinweis-Knopf. Nach einem Fehlversuch darf ich noch einmal; danach kommt die Lösung. Am Ende: dieselbe Erklärung, Pfeile und „Beste Fortsetzung“ wie in der Analyse, Link zur Originalpartie.
- **Leitner:** neu = Kasten 0; richtig beim ersten Versuch → nächster Kasten (1/3/7/14/30 Tage), sonst Kasten 1 (morgen). Jeder Versuch steht in `attempts` (Zug, richtig/falsch, Versuch 1/2, Dauer).
- **Heute fällig (Tagesziel):** alle fälligen Wiederholungen + **10 neue** (Patzer vor Fehlern, neuere Partien zuerst). Danach **„Weiter üben“**: alle übrigen neuen Puzzles ohne Limit, gleiche Reihenfolge (`practiceQueue`). Wiederholungen bleiben nach Leitner geplant und werden nicht vorgezogen.
- **Entscheidung „Gegen Freund“:** Beim Start fragt die App „Wer bist du?“ (Spieler 1 / Spieler 2 / Keiner). Markierungen und Puzzles nur für die eigenen Züge; bei „Keiner“ keine Puzzles.

### Ursprünglicher Plan

- Jede Stellung **vor** einem Fehler oder Patzer wird ein Puzzle. Aufgabe: „Finde den besseren Zug.“
- **Richtig** ist der beste Engine-Zug **und** jeder Zug, der fast gleich gut ist (kleiner Verlust an Gewinnchance) – damit man nicht für gleichwertige Züge bestraft wird.
- Bei Taktiken (Matt, Figurengewinn) folgt die Lösung über mehrere Züge, der Computer antwortet jeweils.
- **Wiederholungssystem: Leitner-Kästen** (leicht nachvollziehbar):
  - 5 Kästen mit Abständen 1 / 3 / 7 / 14 / 30 Tage.
  - Richtig → einen Kasten weiter. Falsch → zurück in Kasten 1 (kommt morgen wieder).
  - Startseite zeigt „Heute fällig: 7 Puzzles“.
- Jeder Versuch wird protokolliert (für die spätere Statistik).


## 4b. Allgemeines Training: Lichess-Puzzles (Stand 12.11.2026)

- **Quelle:** Lichess-Puzzle-Datenbank (`database.lichess.org`, **CC0**), Stand 1.11.2026, ca. 6,2 Mio. Puzzles, 310 MB gepackt. Das Skript `scripts/lichess-puzzles.mjs` lädt die Datei einmalig nach `scripts/.cache/` (nicht im Repo), entpackt sie als Datenstrom (Node-eigenes zstd) und schreibt pro Thema eine Datei nach `src/data/lichess/` plus `meta.json` (Filter, Anzahl, Datum). Neu erzeugen: `node scripts/lichess-puzzles.mjs`.
- **Auswahl:** Puzzle-Rating 400–1800, Beliebtheit ≥ 85, mindestens 1000-mal gespielt, Rating-Abweichung ≤ 90 (verlässliches Rating). Pro Thema **300 Puzzles**, gleichmäßig über 100er-Stufen verteilt, innerhalb einer Stufe die meistgespielten. Jede Zugfolge mit chess.js geprüft. Einige Themen (z. B. Gefangene Figur, Hinlenkung, Ruhiger Zug) haben unter 700 kaum beliebte Puzzles – dort beginnt die Auswahl entsprechend höher.
- **Größe:** 14 Themen × 300 = 4200 Puzzles, zusammen **397 kB** (gepackt **185 kB**). Jedes Thema ist eine eigene Datei (ca. 28 kB, gepackt ca. 13 kB) und wird erst geladen, wenn es gebraucht wird.
- **Themen:** Hängende Figur, Gabel, Fesselung, Spieß, Abzugsangriff, Matt in 1, Matt in 2, Grundreihenmatt, Verteidigen, Gefangene Figur, Ruhiger Zug, Ablenkung, Hinlenkung, Umwandlung – jeweils mit kurzer Erklärung in einfacher Sprache (`src/training/themes.ts`).
- **Lichess-Format (geprüft an Puzzle 00008 und per Test für alle 4200):** Die FEN ist die Stellung **vor** dem Zug des Gegners; der erste Zug in „Moves“ ist der Zug des Gegners. Die App zeigt erst die FEN, spielt nach 0,7 s den Gegnerzug animiert vor (markiert als letzter Zug), danach beginnt meine Lösung; meine Züge stehen an Stelle 2, 4, 6 … von „Moves“, die Antworten des Gegners werden automatisch gespielt.
- **Bedienung wie bei „Meine Fehler“:** zwei Versuche, Pfeile (rot: mein erster falscher Zug, grün: Lösung), „Lösung zeigen“ zum Durchklicken. Richtig ist nur der Lösungszug – oder jeder Zug, der matt setzt (wie bei Lichess); keine Engine-Prüfung. Statt Partie-Link: Thema mit Erklärung. Link „Puzzles: Lichess, CC0“ unter dem Puzzle und auf der Trainingsseite.
- **Puzzle-Rating (vereinfachtes Elo):** erwartete Lösungschance E = 1 / (1 + 10^((Puzzle − ich)/400)); neues Rating = alt + K · (Ergebnis − E). Ergebnis: im ersten Versuch gelöst 1, im zweiten 0,5, nicht gelöst 0. K = 40 für die ersten 15 Puzzles, danach 20. Untergrenze 100. **Startwert:** letzte Chess.com-Wertung (Rapid, sonst Blitz, Bullet, Täglich) **+ 400**, begrenzt auf 600–1800; ohne Chess.com-Partien 1000. Begründung: Puzzle-Ratings liegen im Anfängerbereich deutlich über Partie-Ratings; das Rating findet in den ersten Puzzles schnell zum eigenen Niveau. Gespeichert in `settings` (Schlüssel `puzzleRating`), Versuche in `attempts` mit `lichess:<ID>` – beides im Backup, kein neues Datenbankschema.
- **Auswahl passend zum Rating:** zufällig unter den noch nie gespielten Puzzles im Fenster ±100 um mein Rating; ist dort nichts, wird das Fenster verdoppelt. Sind alle gespielt, darf eines wiederkommen.
- **„Passend zu meinen Schwächen“:** Pro Puzzle wird ein Thema nach Gewicht gezogen. 80 % der Gewichte kommen aus meinen Fehlerarten (aus der Analyse), 20 % gleichmäßig auf alle 14 Themen (je ca. 1,4 %), damit keines ganz verschwindet. Ohne passende Fehler: alle gleich.
- **Zuordnung mit Anteilen (überarbeitet 12.11.2026):** Jede Fehlerart verteilt ihre Anzahl nach festen Anteilen auf passende Themen. So folgt das Training ungefähr dem Anteil meiner Fehlerarten. Themen ohne klaren Bezug zu einer erkannten Fehlerart (Fesselung, Spieß, Gefangene Figur, Ablenkung, Hinlenkung, Umwandlung) bekommen nur den Grundanteil.

| Fehlerart (Analyse) | Themen (Anteil) | Warum |
|---|---|---|
| Material eingestellt | Hängende Figur 50 %, Gabel 25 %, Abzugsangriff 25 % | Material geht meist durch eine hängende Figur verloren, sonst durch einen Doppelangriff |
| Figur oder Bauer ungedeckt gelassen | Hängende Figur 50 %, Verteidigen 50 % | Ungedecktes sehen und rechtzeitig decken |
| Drohung übersehen | Verteidigen 50 %, Gabel 25 %, Abzugsangriff 25 % | Drohungen abwehren; die häufigsten Drohungen sind Doppelangriffe |
| Matt zugelassen | Matt in 1, Matt in 2, Grundreihenmatt, Verteidigen je 25 % | Mattmuster kennen, um sie beim Gegner zu sehen, und rechtzeitig abwehren |
| Matt übersehen | Matt in 1 40 %, Matt in 2 40 %, Grundreihenmatt 20 % | eigene Matts finden |
| Gabel übersehen | Gabel 100 % | gleiches Muster |
| Schach oder Schlagzug ohne Wirkung | Ruhiger Zug 100 % | der stärkste Zug ist oft kein Schach/Schlagzug |
| Stellungsfehler (ohne klare Taktik) | – | kein Taktik-Thema |

**Beispiel – mein Fehlerprofil** (Material eingestellt 95, ungedeckt 70, Drohung übersehen 51, Matt zugelassen 42; zusammen 258 = 37 % / 27 % / 20 % / 16 %): Hängende Figur **27 %**, Verteidigen **23 %**, Gabel **13 %**, Abzugsangriff **13 %**, Matt-Themen zusammen **14 %** (je ca. 4,7 %), die übrigen 7 Themen zusammen **10 %** (je 1,4 %). Geprüft in `tests/unit/lichess.test.ts`.

- **Adressen:** `#/training` (Übersicht beider Arten), `#/training/fehler` (Tagesziel), `#/training/mehr` (Weiter üben), `#/training/allgemein/schwaechen` bzw. `#/training/allgemein/<Thema>`.

## 4c. Brettpartien schnell eintragen (Schritt 12, Stand 13.11.2026)

Ziel: Partien am echten Brett (Schülerliga, Freunde, Turnier), die nicht mitgeschrieben werden, direkt danach am iPhone in ca. 30 Sekunden festhalten.

- **Knopf „Brettpartie eintragen“** auf der Übersicht (unter „Letzte Partien“, bei leerer App im Willkommens-Bereich) und auf der Partien-Seite. Adresse `#/brett` (neu) bzw. `#/brett/<id>` (bearbeiten).
- **Felder als Antipp-Knöpfe:** Ergebnis (Sieg/Remis/Niederlage) und meine Farbe sind Pflicht, alles andere optional. Datum: „Heute“ (Standard), „Gestern“ oder Kalender. Gegner: Name mit Vorschlägen aus früheren Brett-Einträgen (zuletzt gespielte zuerst). Anlass: Schülerliga / Mit Freunden / Turnier / Sonstiges (Standard = Anlass des letzten Eintrags). Wo entschieden: Eröffnung / Mittelspiel / Endspiel. Hauptgründe (Mehrfachauswahl). Notiz. Speichern-Knopf bleibt am Handy über der Navigationsleiste sichtbar. Schnellster Weg: Ergebnis + Farbe + Speichern = 3 Antipper.
- **Optional „Züge einfügen (PGN)“:** wird mit chess.js geprüft (englische Notation, z. B. `1. e4 e5 2. Nf3`; deutsche Kürzel wie „Sf3“ ergeben eine verständliche Meldung). Mit Zügen läuft die Partie durch die normale Analyse, es entstehen Puzzles, und nach dem Speichern öffnet sich die Analyse-Ansicht.
- **Speicherung:** in der Tabelle `games` mit `source: 'brett'`, `mode: 'board'` und dem Zusatzfeld `board` (`occasion`, `decidedIn`, `reasons`, `note`). Ohne Züge: `pgn` leer, `plies` 0 – die Analyse-Warteschlange überspringt solche Einträge und zählt sie nicht mit. Kein neues Datenbankschema; wird wie jede Partie mit dem Konto synchronisiert und ist im Backup.
- **Partienliste:** Abzeichen „Brett“, Anlass statt Zeitklasse, Filter Quelle „Brett“. Ein Eintrag ohne Züge öffnet direkt das Formular; mit Zügen die Analyse (dort „…“ → „Brett-Eintrag bearbeiten“, Anlass und Gründe unter der Überschrift).
- **Bearbeiten und Löschen:** gleiches Formular. Ändern sich Züge oder Farbe, werden Analyse und Puzzles der Partie verworfen und neu berechnet. Löschen (mit Rückfrage) entfernt Eintrag, Analyse und Puzzles; die Löschung wird abgeglichen.
- **Code:** `src/db/boardGames.ts` (Aufbau, Speichern, Löschen, Gegner-Vorschläge, Zuordnung), `src/pages/BoardEntryPage.tsx`. Tests: `tests/unit/boardGames.test.ts`, Sync zweier Geräte in `tests/unit/sync.test.ts`, `tests/e2e/brett.spec.ts` (Mac und Handy).

**Zuordnung der Gründe zu den Fehlerarten** (für Block 9; `REASON_MAPPING` und `boardFindings()` in `src/db/boardGames.ts`). `boardFindings()` liefert je Grund einen eigenen Fehler mit denselben Feldern wie ein Fehler aus der Analyse (Fehlerart, Phase, Zeitnot), damit die Statistik beide Quellen zusammenzählen kann:

| Grund (Brett) | Fehlerart (Analyse, `errorType`) | Phase | Bemerkung |
|---|---|---|---|
| Figur eingestellt | Material eingestellt (`pieceTaken`) | „Wo entschieden“ | |
| Drohung übersehen | Drohung übersehen (`threatMissed`) | „Wo entschieden“ | |
| Matt übersehen | Matt übersehen (`mateMissed`) | „Wo entschieden“ | |
| Matt zugelassen | Matt zugelassen (`mateAllowed`) | „Wo entschieden“ | |
| Eröffnung schlecht | Stellungsfehler (`other`) | immer Eröffnung | |
| Endspiel nicht gewusst | Stellungsfehler (`other`) | immer Endspiel | |
| Zeitnot | – (keine eigene Fehlerart) | – | markiert alle Fehler dieses Eintrags als „in Zeitnot“; allein gewählt = ein Fehler `other` in Zeitnot |
| Gegner hat Fehler gemacht | – | – | kein eigener Fehler |
| Gut gespielt | – | – | kein eigener Fehler |

Regeln für die Statistik: Brett-Einträge zählen **Partien** mit Gründen, nicht einzelne Züge – in Block 9 getrennt ausweisen („aus Brettpartien“) oder je Partie gewichten. Hat ein Brett-Eintrag Züge **und** eine fertige Analyse, zählen die Fehler aus der Analyse; die Gründe bleiben als eigene Einschätzung erhalten (nicht doppelt zählen). „Gabel übersehen“, „ungedeckt gelassen“ und „Schach/Schlagzug ohne Wirkung“ gibt es nur aus der Analyse.

---

## 5. Datenmodell (IndexedDB)

Von Anfang an so angelegt, dass es später zu Supabase passt (eindeutige IDs, Zeitstempel, Feld für Benutzer).

| Tabelle | Inhalt |
|---|---|
| `games` | ID, Datum, Quelle (`app` / `chesscom` / `brett`), Modus (gegen Computer / gegen Freund am selben Gerät / am Brett), bei Brettpartien `board` (Anlass, wo entschieden, Gründe, Notiz), Spielernamen, meine Farbe, Gegner-Stärke, Bedenkzeit, Ergebnis, Abbruchgrund, **PGN mit Restzeit pro Zug** (Standard-Format `{[%clk 0:14:32]}`, wie Lichess/Chess.com) |
| `analyses` | Partie-ID, Engine-Version, Tiefe, pro Zug: Bewertung, bester Zug, Klasse, Phase, Merkmale (Figur eingestellt, Matt übersehen, Zeitnot) |
| `puzzles` | ID, Partie-ID, Stellung (FEN), Lösung(en), Thema/Merkmale, Leitner-Kasten, nächster Fälligkeitstag |
| `attempts` | Puzzle-ID, Datum, richtig/falsch, benötigte Zeit |
| `settings` | Letzte Bedenkzeit, Stärke, Farbe, Brett-Design |

Datensicherung: Export/Import aller Daten als Datei (wichtig, weil Browser-Daten z. B. beim Löschen des Verlaufs verloren gehen können).

Seit Schritt 13 (Dexie-Version 4) trägt jede Zeile zusätzlich `updatedAt` (Änderungszeit, ms) und `dirty` (noch hochzuladen, indiziert); Löschungen stehen bis zum Hochladen in `tombstones`. Auf dem Server hat jede der fünf Tabellen die Spalten `user_id`, `id`, `data` (der lokale Datensatz als JSON), `updated_at`, `deleted`, `synced_at`.

## 5b. Konten und Synchronisierung (Schritt 13, Stand 12.11.2026)

- **Supabase-Projekt „Schach“**, Region **Frankfurt (eu-central-1)**, Gratis-Plan. Datenbank-Struktur als Migrationen in `supabase/migrations/`, Auth-Einstellungen in `supabase/config.toml` (`npx supabase db push --remote`, `npx supabase config push`), Edge Function `supabase/functions/login`. Die CLI ist per Browser-Login verbunden (`npx supabase login` in einem echten Terminal), kein Token im Repo.
- **Schlüssel:** In der App stehen nur Projekt-URL und der öffentliche `sb_publishable_…`-Schlüssel (`src/sync/config.ts`). Der geheime Schlüssel existiert nur auf dem Supabase-Server (Umgebungsvariable der Edge Function) – nicht im Code, nicht bei GitHub, nicht im Browser.
- **E-Mails – geprüft:** Ohne eigenen Mail-Server verschickt Supabase seit 26.9.2024 nur an Mitglieder des eigenen Supabase-Teams (höchstens 2 pro Stunde). Deshalb **ohne E-Mail-Versand**: Bestätigungs-Mail aus, Freigabe per **Einladungscode**, „Passwort vergessen“ über den Admin.
- **Nur eingeladene Personen:** Tabelle `invites` (E-Mail + Code als bcrypt-Hash, nur über Admin-Funktionen erreichbar). Der Auth-Hook „Before User Created“ (Gratis-Plan) lehnt jede Registrierung ohne passende E-Mail + Code ab, prüft den Benutzernamen (3–30 Zeichen, eindeutig ohne Rücksicht auf Groß-/Kleinschreibung) und gibt eine deutsche Meldung zurück. Ein Trigger entfernt den Code aus den Benutzerdaten, legt das Profil an und markiert die Einladung als benutzt (nur einmal nutzbar).
- **Login** mit Benutzername oder E-Mail + Passwort (mindestens 8 Zeichen). Bei Benutzername schlägt die Edge Function `login` die E-Mail auf dem Server nach und meldet an – die E-Mail verlässt den Server nie, Fehlermeldung immer gleich („Benutzername/E-Mail oder Passwort falsch.“).
- **Admin** (Tabelle `admins`): E-Mail freigeben → Code wird einmal angezeigt (mit fertiger Nachricht zum Kopieren), Freigaben ansehen/entfernen, vorläufiges Passwort setzen. Alles in **Einstellungen → „Freunde einladen“** (nur für Admins sichtbar).
- **Row Level Security** auf allen Tabellen: jeder liest/ändert/löscht nur Zeilen mit seiner `user_id`; ohne Anmeldung kein Zugriff. Bewiesen im Live-Test (`tests/live/supabase.test.ts`): Benutzer B kann die Daten von A weder lesen noch ändern, löschen oder eine Zeile mit A's `user_id` anlegen; Admin-Funktionen sind für B gesperrt.
- **Offline zuerst:** Ohne Konto bleibt alles wie bisher (IndexedDB), Supabase wird gar nicht geladen. Mit Konto gleicht die App im Hintergrund ab: beim Start, alle 60 s (wenn sichtbar), beim Wiederkehren in den Tab, wenn das Netz zurückkommt und 4 s nach jeder Änderung. Erst hoch (alle `dirty`-Zeilen und Löschungen, in Paketen bis 400 kB), dann runter (alles mit `synced_at` nach dem letzten Stand, 10 s Überlappung).
- **Konflikte:** Der **neueste Stand gewinnt** (`updated_at` der Änderung). Der Server verwirft ältere Uploads (Trigger), das Gerät übernimmt beim Herunterladen nur Neueres. Daten von vor Schritt 13 haben `updated_at = 0` → bei gleicher ID gewinnt der Stand im Konto.
- **Reihenfolge beim Herunterladen:** Puzzles → Versuche → Einstellungen → Analysen → Partien. So entstehen keine neuen, ungeübten Puzzles über geübte, und kein Gerät analysiert eine Partie neu, deren Analyse schon im Konto liegt (**Analysen werden mitsynchronisiert**).
- **Erster Login auf einem Gerät:** Alle lokalen Daten werden zum Hochladen vorgemerkt und ins Konto übernommen – nichts geht verloren (Test mit zwei Geräten). **Abmelden** lädt erst alles hoch und leert dann nur dieses Gerät (geht nicht, solange etwas nicht hochgeladen ist). **Konto löschen** entfernt Konto, Profil, Einladung und alle Daten (Server und Gerät).
- **Datenschutzhinweis** in den Einstellungen: welche Daten, wo (Frankfurt, EU), wer sie sieht (nur man selbst; der Betreiber sieht E-Mail und Benutzername in der Einladungsliste und könnte als Projekt-Inhaber technisch zugreifen).
- **Tests:** Offline in CI `tests/unit/sync.test.ts` (Server-Nachbau, zwei Geräte, Konflikte, Löschen, erster Login, Version-4-Update, Abmelden löscht nichts im Konto). Live nur lokal: `npm run test:live` (Vitest gegen Supabase + Browser-Test Registrieren → zweites Gerät → Abmelden → Konto löschen; Testkonten werden danach gelöscht).

**Speicherbedarf (gemessen mit den echten 101 Partien):** Partien 183 kB, Analysen 605 kB (Postgres komprimiert die großen JSON-Felder), 478 Puzzles 291 kB, zusammen **ca. 1,1 MB**; mit Indizes, Lösungsversuchen und Änderungsständen grob **1,5 MB pro 100 Partien**. Die leere Datenbank belegt 14 MB. Von den **500 MB** bleiben gut 480 MB → **ca. 300 Nutzer mit je 100 Partien** oder **ca. 60 Nutzer mit je 500 Partien**. Für eine Freundesgruppe reicht das lange.

**Pausieren im Gratis-Plan:** Supabase pausiert Gratis-Projekte nach **7 Tagen ohne Nutzung** (es reichen schon wenige Anfragen pro Tag, damit das nicht passiert – jeder angemeldete App-Nutzer gleicht ab). Ein pausiertes Projekt bleibt laut Supabase lange wiederherstellbar (Dokumentation: bis zu 1 Jahr, ältere Angabe 90 Tage). **Reaktivieren:** https://supabase.com/dashboard → Projekt „Schach“ → **„Resume project“** (bzw. „Restore“) klicken, 1–2 Minuten warten; Daten und Einstellungen sind wieder da. Während der Pause funktioniert die App offline weiter; die Synchronisierung meldet einen Fehler und holt alles nach, sobald das Projekt wieder läuft.

---

## 6. Ordnerstruktur

```
schach/
├── PLAN.md                 ← dieses Dokument
├── README.md               ← Kurzanleitung, Lizenz-Hinweis (GPL)
├── LICENSE                 ← GPL-3.0
├── package.json            ← Liste der verwendeten Bibliotheken
├── vite.config.ts          ← Einstellungen Build + PWA
├── public/
│   ├── engine/             ← stockfish-19-lite-single.js + .wasm
│   └── icons/              ← App-Icons für den Homescreen
├── scripts/                ← Hilfsskripte (später: Lichess-Puzzles aufbereiten)
├── src/
│   ├── main.tsx            ← Startpunkt
│   ├── app/                ← Navigation, Seitenrahmen
│   ├── pages/              ← Start, Spielen, Partien, Analyse, Puzzles, Einstellungen
│   ├── components/         ← Brett, Uhr, Zugliste, Bewertungskurve, Knöpfe …
│   ├── engine/             ← Stockfish-Anbindung (Worker, UCI-Befehle, Warteschlange)
│   ├── chess/              ← Spiellogik, Uhr, PGN mit Zeiten
│   ├── analysis/           ← Klassifizierung, Phase, Taktik-Erkennung, Zeitnot
│   ├── training/           ← Puzzle-Erzeugung, Leitner-System
│   ├── db/                 ← Datenbank-Schema und Zugriffe (Dexie)
│   └── styles/             ← Farben, Schrift, Abstände
└── tests/                  ← automatische Tests (Vitest + Playwright)
```

Tests: **Vitest** = prüft einzelne Rechenregeln (z. B. „ist das ein Patzer?“). **Playwright** = steuert einen echten Browser und klickt die App automatisch durch – so teste ich nach jedem Block, auch in Handy-Größe.

---

## 7. Design-Richtung „Klubhaus“ (neu, 12.11.2026)

Gewählt aus zwei Entwürfen (`design-entwurf/`: A „Klubhaus“, B „Studio“) → **A „Klubhaus“**, dunkle Variante als Standard.

- **Farben:** tiefes Anthrazit (dunkel, Standard) bzw. warmes Papier (hell, Schalter in den Einstellungen). Akzent **Waldgrün**, zweiter Akzent **Messing** für das Wichtigste (Startknopf, Ränge, aktive Reiter). Eigene Farben für **Sieg / Niederlage / Remis** und für Patzer (rot) / Fehler (orange) / Ungenauigkeit (blau). Alle Text-Farbpaare WCAG AA (≥ 4,5:1), die meisten AAA – nachgerechnet.
- **Schrift:** Instrument Serif für große Zahlen und Überschriften (z. B. „10 Puzzles“, Rating), Instrument Sans für alles andere; beide lokal eingebunden.
- **Karten mit unterschiedlichem Gewicht:** eine gefüllte Hauptkarte (grün) pro Seite, sonst ruhige Flächen.
- **Navigation:** Linien-Symbole; am Mac oben, am Handy als Leiste unten (Daumen). Einstellungen über das Zahnrad.
- **Übersicht** (Startseite): Heute fällig, darunter die Trainingsarten „Meine Fehler“ (Startknopf; nach dem Tagesziel „Weiter üben“) und „Allgemeines Training“ (eigener Startknopf, Puzzle-Rating), Chess.com-Wertung je Zeitklasse auf echter Zeitachse (Zeitraum Woche / 4 Wochen [Standard] / 3 Monate / Alles; Tagespunkte bzw. Wochenpunkte mit Wertung am Wochenende; Pausen als Lücke; Veränderung im gewählten Zeitraum; unter 5 Partien Hinweis statt Grafik; Info-Symbol erklärt die Wertung), 3 häufigste **konkrete** Fehlerarten (Fehler ohne klare Taktik als eigene Zeile darunter), letzte 5 Partien, Analyse-Fortschritt.
- **Analyse:** am Mac kein Scrollen – rechte Spalte so hoch wie das Brett mit Reitern „Fehler / Züge / Verlauf“; Navigation und „Nächster Fehler“ direkt unter dem Brett; Nebenaktionen im „…“-Menü. Dicker Bewertungsbalken mit Zahl (am Handy waagerecht über dem Brett), große Bewertungskurve. Letzter Zug mit Farbe **und** Rahmen markiert.
- **Partienliste:** Ergebnis-Abzeichen, Zeitklassen-Symbol, Rating-Unterschied, Patzer-Zahl, Analyse-Status; Filter nach Quelle, Zeitklasse, Ergebnis.
- **Brett-Themes:** Walnuss (Standard), Schiefer, Turniergrün – in den Einstellungen.
- **Bewegung:** kurze, dezente Übergänge (Einblenden, Reiter, Knopfdruck); bei „Bewegung reduzieren“ im System abgeschaltet.
- **Handy:** Brett bildschirmbreit, Bedienknöpfe groß und unten, keine abgeschnittenen Texte (Filter als gleichmäßige Raster).

### Umsetzung mit shadcn/ui (Stand 12.11.2026, in main)

- **Grundlage:** shadcn/ui (Preset `b0` = Stil Nova, Base UI, Lucide-Symbole) mit Tailwind v4 (`@tailwindcss/vite`), Pfad-Alias `@/`. Komponenten liegen in `src/components/ui/` (Card, Button, Badge, Tabs, ToggleGroup, Dialog, DropdownMenu, Tooltip, Popover, Slider, Switch, Input, Alert, Progress, Chart …).
- **Farben:** Klubhaus-Farben auf die shadcn-Variablen gelegt (`src/index.css`, `:root` hell, `.dark` dunkel = Standard); Zusatzfarben für Messing, Sieg/Niederlage/Remis und Fehler-Markierungen. Eigene CSS-Datei `app.css` und `Icons.tsx` entfallen; übrig: `layout.css` (Brettgröße), `board.css`, `tokens.css` (Brett-Themes). Chessground-CSS liegt in der Ebene `base`, damit Tailwind es nicht überschreibt.
- **Grafiken:** Wertungsverlauf und Bewertungskurve mit Recharts (shadcn Chart), Tooltip mit Datum, Wertung und Partien.
- **Ladezeit:** Seiten werden erst bei Bedarf geladen. Bundle vorher 503 kB JS (gzip 162) + 54 kB CSS; nachher 1157 kB JS (gzip 384) in 34 Dateien + 103 kB CSS (gzip 19), davon Recharts 335 kB; beim Öffnen der Übersicht ca. 960 kB.

## 7b. App fürs iPhone (Block 8, Stand 12.11.2026)

- **Progressive Web App** mit `vite-plugin-pwa` 2.0 (Workbox). Manifest: Name „Schach“, `display: standalone` (Vollbild ohne Safari-Leiste), Start und Bereich `/schach/` (GitHub Pages), dunkle Theme- und Hintergrundfarbe `#121519`.
- **Icons** im Klubhaus-Stil (Waldgrün, Messing-Ring, Springer aus dem Brett-Figurensatz cburnett), erzeugt mit `node scripts/icons.mjs` (rendert mit dem Chromium aus Playwright): 192 und 512 px, „maskable“ 512 px mit Rand für Android, `apple-touch-icon` 180 px, Favicon 32 px und SVG.
- **iPhone-Angaben** in `index.html`: `apple-mobile-web-app-capable`, Statusleiste `black-translucent` (App reicht bis unter die Uhr), `viewport-fit=cover`.
- **Safe Areas:** Kopfzeile mit Abstand zur Notch, Navigation unten mit Abstand zur Home-Leiste, links/rechts Abstand im Querformat; das Handy-Brett zieht die seitlichen Ränder ab.
- **Offline:** Der Service Worker speichert beim ersten Besuch die ganze App vorab (ca. 73 Dateien, 4,1 MB): Seiten, Schriften, Stockfish (JS + WASM, 1,8 MB) und **alle 14 Puzzle-Themen**. Ohne Internet funktionieren Spielen, Analyse und beide Trainingsarten. Supabase und Chess.com werden nie aus dem Speicher bedient; die Synchronisierung merkt sich Änderungen und gleicht ab, sobald wieder Internet da ist (Ereignis „online“).
- **Updates:** Eine neue Version wird im Hintergrund geladen (Prüfung beim Start, beim Zurückkehren in die App und stündlich). Dann erscheint unten „Neue Version verfügbar – Neu laden“. Aktiviert wird sie **nur auf Klick** – nie automatisch mitten in einer Partie oder einem Puzzle. Die Version steht in den Einstellungen.
- **Hinweis für iPhone-Nutzer:** In Safari am iPhone/iPad zeigt die Übersicht eine ausblendbare Anleitung „Zum Home-Bildschirm“ (Teilen → Zum Home-Bildschirm → Hinzufügen) mit dem Hinweis, dass die Homescreen-App **einen eigenen Speicher** hat (einmal anmelden). In der installierten App ohne Konto erscheint stattdessen ein kurzer Hinweis „einmal anmelden“. Dauerhaft unter Einstellungen → „App aufs iPhone“.
- **Tests:** `tests/e2e/pwa.spec.ts` baut zwei Versionen und liefert sie wie GitHub Pages unter `/schach/` aus: Manifest/Icons, Offline-Start (Spielen gegen Stockfish, Partie + Analyse, Lichess-Puzzle ohne Internet), Update-Meldung (kein Neuladen von selbst, erst auf Klick die neue Version), iPhone-Hinweise und Safe Areas in Handy-Größe.

## 8. Reihenfolge der Schritte

Jeder Block endet mit: Test (automatisch + im Browser in Mac- und Handy-Größe) → kurze Zusammenfassung, wie du es ausprobierst.

### Neue Reihenfolge (ab 12. November 2026)

Schwerpunkt verschoben: Die App soll vor allem ein **persönlicher Schachberater** für meine Chess.com-Partien sein – analysieren, Fehler finden, gezielt darauf trainieren. Chess.com-Partien enthalten die Restzeit pro Zug (`%clk`), dafür braucht es die eigene Uhr noch nicht. Fehler erkennt Stockfish; kostenpflichtige KI-APIs nutzen wir vorerst nicht.

Reihenfolge: **4 Speichern + Chess.com-Import** → 5 Analyse-Rechnung → 6 Analyse-Ansicht → 7 Puzzles → 9 Statistik → erst danach 3 Uhr → 8 App & Feinschliff.

| Block | Inhalt | Ergebnis zum Ausprobieren |
|---|---|---|
| **0 Einrichtung** ✅ | Projekt anlegen, Bibliotheken installieren, Git-Repo, GitHub Pages + automatisches Veröffentlichen | Leere App läuft lokal und unter einer öffentlichen Adresse |
| **1 Brett & Regeln** ✅ | Brett mit chessground + chess.js, legale Züge, Umwandlung (Bauer → Dame etc.), Grund-Layout, Design-Grundlagen | Man kann eine Partie gegen sich selbst ziehen |
| **2 Gegen Stockfish** ✅ | Engine im Worker, Start-Bildschirm: Farbe, Stärke (Elo/Skill) · zweiter Modus „Gegen Freund (am selben Gerät)“ mit Namen · Aufgeben · Materialvorteil und geschlagene Figuren · Zurückblättern (Pfeiltasten, Knöpfe, Zugliste) · größere Koordinaten | Partie gegen den Computer oder einen Freund |
| **4 Speichern + Chess.com-Import** ✅ | IndexedDB (alle Tabellen aus Abschnitt 5), App-Partien automatisch speichern, Partienliste mit Filter, Partie ansehen, PGN-Export, Datensicherung · Chess.com-Import über die öffentliche API (geprüft: funktioniert direkt aus dem Browser, CORS erlaubt), nur normales Schach, keine Doppelten, Fortschrittsanzeige | Partien bleiben nach Neuladen erhalten; eigene Chess.com-Partien in der Liste |
| **5 Analyse-Rechnung** ✅ | Hintergrund-Analyse, Gewinnchance, Klassen, Phase, Figur eingestellt, Matt übersehen, Zeitnot (aus `%clk` der Chess.com-Partien) | Analyse läuft für App- und Chess.com-Partien |
| **6 Analyse-Ansicht** ✅ | Durchklicken, Bewertungskurve, bester Zug als Pfeil, Zusammenfassung | Eigene Partie Zug für Zug nachvollziehen |
| **7 Puzzles** ✅ | Puzzles aus Fehlern, Lösen am Brett, Leitner-Wiederholung, „Heute fällig“ | Eigene Fehler als Training |
| **13 Konten & Synchronisierung** ✅ (vorgezogen) | Supabase (Gratis-Plan, Frankfurt): Registrierung nur mit Einladungscode, Login mit Benutzername/E-Mail, Row Level Security, Offline-zuerst-Abgleich aller fünf Tabellen, Konto löschen, Datenschutzhinweis (s. Abschnitt 5b) | Gleiche Daten auf Mac und iPhone; Freunde einladen |
| **10 Lichess-Puzzles** ✅ (vorgezogen) | Allgemeines Training aus der Lichess-Datenbank (CC0): 14 Themen, Puzzle-Rating, „Passend zu meinen Schwächen“ oder Thema wählen; „Weiter üben“ ohne Tageslimit (s. Abschnitt 4b) | Zwei Trainingsarten mit eigenem Startknopf |
| **12 Brettpartien eintragen** ✅ (vorgezogen) | Schnell-Eintrag am Handy: Ergebnis, Farbe, Gegner, Anlass, Phase, Hauptgründe, Notiz, optional Züge (PGN → Analyse); Abzeichen und Filter „Brett“, bearbeiten/löschen, synchronisiert (s. Abschnitt 4c) | Brettpartie in ca. 30 s eintragen |
| **9 Statistik** | (siehe unten, vorgezogen) | Wo/wie ich verliere |
| **3 Uhr & Partieende** | Schachuhr mit Inkrement (Standard 15+10, wählbar), Partieende durch Zeit, keine Zugrücknahme, keine Hinweise | Vollständige Partie mit Uhr |
| **8 App fürs iPhone** ✅ | PWA (Homescreen, offline, Update-Meldung, Safe Areas, Installationshinweis) – s. Abschnitt 7b | App aufs iPhone installieren und nutzen |

### Spätere Schritte (nur vorgesehen, noch nicht gebaut)

| Schritt | Inhalt | Vorbereitet durch |
|---|---|---|
| 9 Statistik (vorgezogen, s. o.) | Wo/wie ich verliere: nach Phase, Fehlertyp, Zeitnot, Farbe, Eröffnung, Quelle (inkl. Brettpartien über `boardFindings()`, s. Abschnitt 4c). Sinnvoll ab ca. 15–20 Partien (App zeigt bis dahin „noch zu wenig Daten“). | Merkmale ab Block 5, Brett-Gründe ab Schritt 12 |
| 13b Freundesgruppe | Rangliste (z. B. gelöste Puzzles, Serien) auf Basis der Konten aus Schritt 13. | Konten, Profile (Abschnitt 5b) |
| 14 Maia (optional) | Menschlich spielender Gegner (trainiert auf Lichess-Partien). Im Browser technisch aufwendiger → vorher kurze Machbarkeitsprüfung. | Engine-Anbindung ist austauschbar gebaut |

Bewusst **nicht** geplant: Online-Spiel gegeneinander.

---

## 9. Kosten & Lizenzen

- Laufende Kosten: **0 €**. GitHub (Repo + Pages) und Supabase-Gratis-Plan (500 MB Datenbank, 50 000 aktive Nutzer/Monat, Edge Functions inklusive) ohne Kreditkarte.
- Lizenz des Repos: **GPL-3.0** (wegen Stockfish und chessground).
- Lichess-Puzzles: **CC0** (gemeinfrei); Hinweis „Puzzles: Lichess, CC0“ in der App.
- Ohne Konto bleiben die Daten ausschließlich auf dem Gerät; mit Konto bei Supabase in Frankfurt (EU), siehe Abschnitt 5b.

## 10. Offene Punkte / Annahmen

- ~~Puzzles aus „Gegen Freund“-Partien~~ → entschieden (Block 7): „Wer bist du?“ beim Start, Puzzles nur aus eigenen Zügen.
- Fesselung, Spieß, Abzugsangriff: im Begriffs-Wörterbuch, aber noch ohne Erkennungsregel.
- Analyse-Dauer: am Mac gemessen (~9 s/Partie bei Tiefe 16, s. Abschnitt 3). Am iPhone noch selbst ablesen (Anzeige in „Partien“).
- Ladezeit: Seiten und Puzzle-Themen werden bei Bedarf geladen, die PWA speichert alles nach dem ersten Besuch; Recharts (ca. 330 kB) ist der größte Brocken.
- Puzzle-Rating: Startwert (+400 auf Chess.com) und K-Faktor sind Annahmen → nach einigen Wochen am eigenen Verlauf prüfen.
- Schwellen für Spielphase und „Figur eingestellt“ → an echten Partien feinjustieren.

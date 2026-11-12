# Schach-Trainings-App – Plan

Stand: 12. November 2026 · Status: Blöcke 0–2, 4 (mit Chess.com-Import), 5 und 6 fertig, als Nächstes Block 7

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
| Später | Supabase (Gratis-Plan) | Konten + Rangliste für die Freundesgruppe. |

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
- **Bewertungsbalken** links am Brett, **Bewertungskurve** unter der Zugliste (Gewinnchance Weiß, Fehler als Punkte, Tooltip, Klick springt zum Zug), Bewertungszahl darüber.
- **Zum ersten Fehler / Nächster Fehler** (Fehler und Patzer, ohne Ungenauigkeiten).
- Markierungsfarben mit dem Paletten-Prüfer abgestimmt: Patzer rot, Fehler orange, Ungenauigkeit **blau** (gelb/orange waren bei Rot-Grün-Schwäche kaum zu unterscheiden); zusätzlich immer ??/?/?!.

Ansicht: Brett + Zugliste zum Durchklicken (auch per Pfeiltasten / Wischen), Bewertungskurve, farbige Markierung der Fehler, Pfeil für den besten Zug, kurze Zusammenfassung oben („2 Patzer, 1 Figur eingestellt, 3 von 4 Fehlern in Zeitnot“).

## 4. Puzzles aus eigenen Fehlern

- Jede Stellung **vor** einem Fehler oder Patzer wird ein Puzzle. Aufgabe: „Finde den besseren Zug.“
- **Richtig** ist der beste Engine-Zug **und** jeder Zug, der fast gleich gut ist (kleiner Verlust an Gewinnchance) – damit man nicht für gleichwertige Züge bestraft wird.
- Bei Taktiken (Matt, Figurengewinn) folgt die Lösung über mehrere Züge, der Computer antwortet jeweils.
- **Wiederholungssystem: Leitner-Kästen** (leicht nachvollziehbar):
  - 5 Kästen mit Abständen 1 / 3 / 7 / 14 / 30 Tage.
  - Richtig → einen Kasten weiter. Falsch → zurück in Kasten 1 (kommt morgen wieder).
  - Startseite zeigt „Heute fällig: 7 Puzzles“.
- Jeder Versuch wird protokolliert (für die spätere Statistik).

---

## 5. Datenmodell (IndexedDB)

Von Anfang an so angelegt, dass es später zu Supabase passt (eindeutige IDs, Zeitstempel, Feld für Benutzer).

| Tabelle | Inhalt |
|---|---|
| `games` | ID, Datum, Quelle (`app` / `chesscom` / `brett`), Modus (gegen Computer / gegen Freund am selben Gerät), Spielernamen, meine Farbe, Gegner-Stärke, Bedenkzeit, Ergebnis, Abbruchgrund, **PGN mit Restzeit pro Zug** (Standard-Format `{[%clk 0:14:32]}`, wie Lichess/Chess.com) |
| `analyses` | Partie-ID, Engine-Version, Tiefe, pro Zug: Bewertung, bester Zug, Klasse, Phase, Merkmale (Figur eingestellt, Matt übersehen, Zeitnot) |
| `puzzles` | ID, Partie-ID, Stellung (FEN), Lösung(en), Thema/Merkmale, Leitner-Kasten, nächster Fälligkeitstag |
| `attempts` | Puzzle-ID, Datum, richtig/falsch, benötigte Zeit |
| `settings` | Letzte Bedenkzeit, Stärke, Farbe, Brett-Design |

Datensicherung: Export/Import aller Daten als Datei (wichtig, weil Browser-Daten z. B. beim Löschen des Verlaufs verloren gehen können).

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

## 7. Design-Richtung

- Ruhig und hochwertig: warmes, gedecktes Off-White (hell) bzw. tiefes Graublau (dunkel, automatisch nach System), **eine** Akzentfarbe sparsam eingesetzt.
- Brett ist das größte Element; am Handy bildschirmbreit, Uhr direkt darüber/darunter, große Zahlen.
- Klare Schrift mit gleich breiten Ziffern für die Uhr, lokal eingebunden (keine externen Dienste).
- Keine bunten Verläufe, keine Karten-Flut, keine Emoji-Icons; schlichte Linien-Icons.
- Brett-Farben: gedämpfte, klassische Töne (wählbar). Figurensatz: „cburnett“ (frei lizenziert, Standard bei Lichess) – Alternative später wählbar.
- Ganze Oberfläche auf Deutsch, Schachbegriffe deutsch (Patzer, Ungenauigkeit, Remis, Aufgabe).

---

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
| **7 Puzzles** | Puzzles aus Fehlern, Lösen am Brett, Leitner-Wiederholung, „Heute fällig“ | Eigene Fehler als Training |
| **9 Statistik** | (siehe unten, vorgezogen) | Wo/wie ich verliere |
| **3 Uhr & Partieende** | Schachuhr mit Inkrement (Standard 15+10, wählbar), Partieende durch Zeit, keine Zugrücknahme, keine Hinweise | Vollständige Partie mit Uhr |
| **8 App & Feinschliff** | PWA (Homescreen, offline), Handy-Bedienung, Ladezeiten, Endkontrolle | App aufs iPhone installieren und nutzen |

### Spätere Schritte (nur vorgesehen, noch nicht gebaut)

| Schritt | Inhalt | Vorbereitet durch |
|---|---|---|
| 9 Statistik (vorgezogen, s. o.) | Wo/wie ich verliere: nach Phase, Fehlertyp, Zeitnot, Farbe, Eröffnung. Sinnvoll ab ca. 15–20 Partien (App zeigt bis dahin „noch zu wenig Daten“). | Merkmale werden schon ab Block 5 gespeichert |
| 10 Lichess-Puzzles | Zusatz-Puzzles aus der freien Lichess-Puzzle-Datenbank (database.lichess.org, gemeinfrei/CC0), passend zu meinen Schwächen-Themen und meinem Niveau. Die Datei ist sehr groß → ein Skript schneidet vorab eine kleine Auswahl je Thema/Schwierigkeit zu, die mit der App ausgeliefert wird. | `scripts/`, gleiche Puzzle-Ansicht wie Block 7 |
| 12 Schnell-Eintrag Brettpartie | Nur Knöpfe: Ergebnis, Phase, Fehlertyp – fließt in die Statistik ein. | Quelle `brett` |
| 13 Freundesgruppe | Supabase (Gratis-Plan): Konten, Gruppe, Rangliste (z. B. gelöste Puzzles, Serien). Lokale Daten werden hochgeladen. | IDs + Benutzerfeld im Datenmodell |
| 14 Maia (optional) | Menschlich spielender Gegner (trainiert auf Lichess-Partien). Im Browser technisch aufwendiger → vorher kurze Machbarkeitsprüfung. | Engine-Anbindung ist austauschbar gebaut |

Bewusst **nicht** geplant: Online-Spiel gegeneinander.

---

## 9. Kosten & Lizenzen

- Laufende Kosten: **0 €**. GitHub (Repo + Pages) und später Supabase-Gratis-Plan ohne Kreditkarte.
- Lizenz des Repos: **GPL-3.0** (wegen Stockfish und chessground).
- Daten bleiben bis Schritt 13 ausschließlich auf deinem Gerät.

## 10. Offene Punkte / Annahmen

- Partien „gegen Freund“ werden wie Computer-Partien gespeichert und analysiert (beide Seiten). Offen: Aus welchen Fehlern entstehen dort Puzzles – nur aus meinen? Dann muss ich beim Start angeben, welcher Spieler ich bin. → Klären vor Block 7.
- Analyse-Dauer: am Mac gemessen (~9 s/Partie bei Tiefe 16, s. Abschnitt 3). Am iPhone noch selbst ablesen (Anzeige in „Partien“).
- Schwellen für Spielphase und „Figur eingestellt“ → an echten Partien feinjustieren.

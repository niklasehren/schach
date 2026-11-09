# Schach-Training

Persönliche Schach-Trainings-App: gegen Stockfish spielen, Partien automatisch analysieren und aus den eigenen Fehlern Puzzles mit Wiederholungssystem üben. Läuft komplett im Browser, auch als Homescreen-App am Handy.

Plan und Reihenfolge der Schritte: [PLAN.md](PLAN.md)

## Lokal starten

```sh
npm install
npm run dev        # Vorschau unter http://localhost:5173
npm test           # Regel-Tests
npm run test:e2e   # Browser-Tests (Mac- und Handy-Größe)
```

Jeder Push auf `main` wird automatisch auf GitHub Pages veröffentlicht.

## Lizenz

GPL-3.0-or-later. Verwendet [Stockfish](https://stockfishchess.org) (GPL), [chessground](https://github.com/lichess-org/chessground) (GPL) und [chess.js](https://github.com/jhlywa/chess.js) (BSD).

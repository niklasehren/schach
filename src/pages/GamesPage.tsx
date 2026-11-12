import { useState } from 'react';
import { countGames, listGames, type SourceFilter } from '../db/games';
import type { GameRecord } from '../db/schema';
import { useLive } from '../db/useLive';
import { formatDate, formatTimeControl, myResultText, scoreText, sourceText } from '../chess/format';
import { href } from '../app/router';

const PAGE = 50;

const filters: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'app', label: 'App' },
  { value: 'chesscom', label: 'Chess.com' },
];

export function GamesPage() {
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [limit, setLimit] = useState(PAGE);
  const games = useLive(() => listGames(filter, limit), [filter, limit]);
  const total = useLive(() => countGames(filter), [filter]);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Partien</h1>
        {total !== undefined && <span className="page-count">{total === 1 ? '1 Partie' : `${total} Partien`}</span>}
      </div>

      <div className="segmented segmented-3" role="radiogroup" aria-label="Quelle">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={filter === f.value}
            onClick={() => {
              setFilter(f.value);
              setLimit(PAGE);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {games && games.length === 0 && (
        <div className="empty">
          <p>Noch keine Partien{filter !== 'all' ? ` aus dieser Quelle` : ''}.</p>
          <p>
            Spiel eine Partie unter <a href={href({ page: 'spielen' })}>Spielen</a> oder hol dir deine Partien über{' '}
            <a href={href({ page: 'import' })}>Import</a> von Chess.com.
          </p>
        </div>
      )}

      {games && games.length > 0 && (
        <ul className="game-list" data-testid="game-list">
          {games.map((g) => (
            <li key={g.id}>
              <GameRow game={g} />
            </li>
          ))}
        </ul>
      )}

      {games && total !== undefined && games.length < total && (
        <button className="btn btn-inline" onClick={() => setLimit((l) => l + PAGE)}>
          Weitere anzeigen ({total - games.length})
        </button>
      )}
    </div>
  );
}

function opponentOf(g: GameRecord): { name: string; rating?: number; color?: 'white' | 'black' } {
  if (!g.myColor) return { name: `${g.white.name} – ${g.black.name}` };
  const opp = g.myColor === 'white' ? g.black : g.white;
  return { name: opp.isEngine && opp.detail ? `${opp.name} · ${opp.detail}` : opp.name, rating: opp.rating };
}

function GameRow({ game: g }: { game: GameRecord }) {
  const opp = opponentOf(g);
  const myRating = g.myColor ? g[g.myColor].rating : undefined;
  const outcome = g.myResult ?? 'neutral';
  return (
    <a className="game-row" href={href({ page: 'partie', id: g.id })} data-testid="game-row">
      <span className={`game-outcome outcome-${outcome}`}>
        {g.myResult && <span className="game-outcome-label">{myResultText[g.myResult]}</span>}
        <span className="game-score">{scoreText(g.result)}</span>
      </span>
      <span className="game-main">
        <span className="game-opponent">
          {g.myColor && (
            <span
              className={`color-swatch swatch-${g.myColor}`}
              title={g.myColor === 'white' ? 'Ich hatte Weiß' : 'Ich hatte Schwarz'}
              aria-label={g.myColor === 'white' ? 'mit Weiß' : 'mit Schwarz'}
            />
          )}
          <span className="game-opponent-name">{g.myColor ? `gegen ${opp.name}` : opp.name}</span>
          {opp.rating !== undefined && <span className="game-rating">{opp.rating}</span>}
        </span>
        <span className="game-meta">
          {formatDate(g.date)} · <span className={`source source-${g.source}`}>{sourceText[g.source]}</span>
          {g.timeControl && <> · {formatTimeControl(g.timeControl)}</>}
          {myRating !== undefined && <> · ich {myRating}</>}
        </span>
      </span>
      <span className="game-chevron" aria-hidden>
        ›
      </span>
    </a>
  );
}

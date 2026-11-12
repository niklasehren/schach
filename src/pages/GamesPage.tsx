import { useMemo, useState } from 'react';
import { db, type GameRecord } from '../db/schema';
import { useLive } from '../db/useLive';
import { href } from '../app/router';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { GameRow } from '../components/GameRow';
import { useQueueState } from '../analysis/useQueue';

const PAGE = 50;

type SourceF = 'all' | GameRecord['source'];
type TimeF = 'all' | 'bullet' | 'blitz' | 'rapid' | 'daily';
type ResultF = 'all' | 'win' | 'loss' | 'draw';

function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className="chip" onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function GamesPage() {
  const [source, setSource] = useState<SourceF>('all');
  const [time, setTime] = useState<TimeF>('all');
  const [result, setResult] = useState<ResultF>('all');
  const [limit, setLimit] = useState(PAGE);
  const all = useLive(() => db.games.orderBy('date').reverse().toArray(), []);
  const filtered = useMemo(
    () =>
      (all ?? []).filter(
        (g) => (source === 'all' || g.source === source) && (time === 'all' || g.timeClass === time) && (result === 'all' || g.myResult === result),
      ),
    [all, source, time, result],
  );
  const shown = filtered.slice(0, limit);
  const ids = shown.map((g) => g.id);
  const analyses = useLive(
    () => db.analyses.where('gameId').anyOf(ids).toArray().then((rows) => new Map(rows.map((a) => [a.gameId, a]))),
    [ids.join(',')],
  );
  const queue = useQueueState();
  const reset = () => setLimit(PAGE);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Partien</h1>
        {all && <span className="page-count">{filtered.length === 1 ? '1 Partie' : `${filtered.length} Partien`}</span>}
      </div>

      <AnalysisPanel />

      <div className="filters">
        <div className="segmented segmented-3" role="radiogroup" aria-label="Quelle">
          {(
            [
              ['all', 'Alle'],
              ['app', 'App'],
              ['chesscom', 'Chess.com'],
            ] as [SourceF, string][]
          ).map(([v, t]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={source === v}
              onClick={() => {
                setSource(v);
                reset();
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <Chips
          label="Zeitklasse"
          value={time}
          onChange={(v) => {
            setTime(v);
            reset();
          }}
          options={[
            ['all', 'Alle Zeiten'],
            ['bullet', 'Bullet'],
            ['blitz', 'Blitz'],
            ['rapid', 'Rapid'],
            ['daily', 'Täglich'],
          ]}
        />
        <Chips
          label="Ergebnis"
          value={result}
          onChange={(v) => {
            setResult(v);
            reset();
          }}
          options={[
            ['all', 'Alle Ergebnisse'],
            ['win', 'Siege'],
            ['loss', 'Niederlagen'],
            ['draw', 'Remis'],
          ]}
        />
      </div>

      {all && filtered.length === 0 && (
        <div className="empty">
          <p>{all.length === 0 ? 'Noch keine Partien.' : 'Keine Partien für diese Filter.'}</p>
          {all.length === 0 && (
            <p>
              Spiel eine Partie unter <a href={href({ page: 'spielen' })}>Spielen</a> oder hol dir deine Partien über{' '}
              <a href={href({ page: 'import' })}>Import</a> von Chess.com.
            </p>
          )}
        </div>
      )}

      {shown.length > 0 && (
        <div className="game-list card-list" data-testid="game-list">
          {shown.map((g) => (
            <GameRow key={g.id} game={g} analysis={analyses?.get(g.id)} analysing={queue.current?.gameId === g.id} />
          ))}
        </div>
      )}

      {filtered.length > shown.length && (
        <button className="btn btn-inline" onClick={() => setLimit((l) => l + PAGE)}>
          Weitere anzeigen ({filtered.length - shown.length})
        </button>
      )}
    </div>
  );
}

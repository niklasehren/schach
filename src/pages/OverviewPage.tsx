import { useMemo, useState } from 'react';
import { db, type GameRecord } from '../db/schema';
import { useLive } from '../db/useLive';
import { href } from '../app/router';
import { analysisQueue } from '../analysis/queue';
import { useQueueState } from '../analysis/useQueue';
import { countErrorTypes } from '../analysis/errorTypes';
import { todaysQueue } from '../training/leitner';
import { formatDate } from '../chess/format';
import { GameRow } from '../components/GameRow';
import { Icon } from '../components/Icons';

const tcLabels: Record<string, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', daily: 'Täglich' };

export function OverviewPage() {
  const games = useLive(() => db.games.orderBy('date').reverse().toArray(), []);
  const analyses = useLive(() => db.analyses.where('status').equals('done').toArray(), []);
  const puzzles = useLive(() => db.puzzles.toArray(), []);
  const queue = useQueueState();

  if (!games || !analyses || !puzzles) return <p className="page-note">Lädt …</p>;

  if (games.length === 0) {
    return (
      <div className="page overview">
        <section className="card hero-card welcome">
          <span className="eyebrow">Willkommen</span>
          <h1 className="hero-title">Dein persönlicher Schachberater</h1>
          <p className="hero-sub">Lade deine Chess.com-Partien oder spiel eine Partie. Die App findet deine Fehler und macht daraus Training.</p>
          <div className="hero-actions">
            <a className="btn btn-gold btn-large" href={href({ page: 'import' })}>
              <Icon name="import" /> Chess.com-Partien laden
            </a>
            <a className="btn btn-ghost-light btn-large" href={href({ page: 'spielen' })}>
              <Icon name="play" /> Partie spielen
            </a>
          </div>
        </section>
      </div>
    );
  }

  const today = todaysQueue(puzzles, Date.now());
  const due = today.due.length + today.fresh.length;
  const errorTypes = countErrorTypes(analyses);
  const totalErrors = errorTypes.reduce((s, e) => s + e.count, 0);
  const byId = new Map(analyses.map((a) => [a.gameId, a]));

  return (
    <div className="page overview">
      <section className="card hero-card" aria-labelledby="due-title">
        <span className="eyebrow" id="due-title">
          Heute fällig
        </span>
        <div className="hero-number">
          <span className="num-xl" data-testid="overview-due">
            {due}
          </span>
          <span className="hero-unit">{due === 1 ? 'Puzzle' : 'Puzzles'}</span>
        </div>
        <span className="hero-sub">
          {today.fresh.length} neue aus deinen Fehlern · {today.due.length} Wiederholungen
        </span>
        <div className="train-types" role="list" aria-label="Trainingsarten">
          <a className="train-type is-active" role="listitem" href={href({ page: 'training' })}>
            <Icon name="target" size={22} />
            <span>
              <strong>Meine Fehler</strong>
              <small>Stellungen aus deinen Partien</small>
            </span>
          </a>
          <span className="train-type is-soon" role="listitem" aria-disabled="true">
            <Icon name="book" size={22} />
            <span>
              <strong>Allgemeines Training</strong>
              <small>Taktik zu deinen Schwächen · kommt bald</small>
            </span>
          </span>
        </div>
        <a className="btn btn-gold btn-large hero-cta" href={href({ page: 'training' })} data-testid="overview-start">
          <Icon name="target" /> {due ? 'Training starten' : 'Zum Training'}
        </a>
      </section>

      <RatingCard games={games} />

      <section className="card mistakes-card">
        <div className="card-head">
          <span className="eyebrow">Deine häufigsten Fehler</span>
          {totalErrors > 0 && <span className="card-hint">aus {totalErrors} Fehlern und Patzern</span>}
        </div>
        {errorTypes.length === 0 ? (
          <p className="card-empty">Erscheint, sobald Partien analysiert sind.</p>
        ) : (
          <ol className="mistake-list" data-testid="error-types">
            {errorTypes.slice(0, 3).map((e, i) => (
              <li key={e.type}>
                <span className="mistake-rank">{i + 1}</span>
                <span className="mistake-label">
                  {e.label}
                  <span className="meter">
                    <i style={{ width: `${(e.count / errorTypes[0].count) * 100}%` }} />
                  </span>
                </span>
                <span className="mistake-count">
                  {e.count}
                  <small>×</small>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card recent-card">
        <div className="card-head">
          <span className="eyebrow">Letzte Partien</span>
          <a className="card-link" href={href({ page: 'partien' })}>
            Alle →
          </a>
        </div>
        <div className="game-list plain">
          {games.slice(0, 5).map((g) => (
            <GameRow key={g.id} game={g} analysis={byId.get(g.id)} analysing={queue.current?.gameId === g.id} />
          ))}
        </div>
      </section>

      <section className="card progress-card" data-testid="overview-analysis">
        <span className="eyebrow">Analyse</span>
        <span className="progress-num">
          <b>{queue.processed}</b> von {queue.total} Partien
        </span>
        <span className="meter wide">
          <i style={{ width: `${queue.total ? (queue.processed / queue.total) * 100 : 0}%` }} />
        </span>
        <span className="card-hint">
          {queue.processed >= queue.total
            ? 'alle analysiert'
            : queue.status === 'paused'
              ? 'pausiert'
              : 'läuft, solange die App offen ist'}
        </span>
        {queue.processed < queue.total && (
          <button className="btn btn-small" onClick={() => (queue.status === 'paused' ? analysisQueue.resume() : analysisQueue.pause())}>
            {queue.status === 'paused' ? 'Weiter' : 'Pause'}
          </button>
        )}
      </section>
    </div>
  );
}

/** Rating-Verlauf aus den importierten Chess.com-Partien (je Zeitklasse) */
function RatingCard({ games }: { games: GameRecord[] }) {
  const series = useMemo(() => {
    const out: Record<string, { date: number; rating: number }[]> = {};
    for (const g of [...games].reverse()) {
      if (g.source !== 'chesscom' || !g.myColor || !g.timeClass) continue;
      const r = g[g.myColor].rating;
      if (r === undefined) continue;
      (out[g.timeClass] ??= []).push({ date: g.date, rating: r });
    }
    return out;
  }, [games]);
  const classes = Object.keys(series)
    .filter((k) => series[k].length >= 2)
    .sort((a, b) => series[b].length - series[a].length);
  const [pick, setPick] = useState<string | null>(null);
  const tc = pick && classes.includes(pick) ? pick : classes[0];

  if (!tc) {
    return (
      <section className="card rating-card">
        <span className="eyebrow">Chess.com-Rating</span>
        <p className="card-empty">Erscheint, sobald du Chess.com-Partien importiert hast.</p>
      </section>
    );
  }
  const pts = series[tc];
  const now = pts.at(-1)!.rating;
  const delta = now - pts[0].rating;
  const lo = Math.min(...pts.map((p) => p.rating));
  const hi = Math.max(...pts.map((p) => p.rating));
  const W = 600;
  const H = 160;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (r: number) => 10 + (1 - (r - lo) / Math.max(1, hi - lo)) * (H - 20);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join('');

  return (
    <section className="card rating-card" data-testid="rating-card">
      <div className="card-head">
        <span className="eyebrow">Chess.com {tcLabels[tc]}</span>
        <span className={`delta ${delta >= 0 ? 'is-up' : 'is-down'}`}>
          {delta >= 0 ? '+' : '−'}
          {Math.abs(delta)} seit {formatDate(pts[0].date).slice(0, 6)}
        </span>
      </div>
      <div className="rating-now">
        <span className="num-l">{now}</span>
        <span className="card-hint">
          höchstes {hi} · {pts.length} Partien
        </span>
      </div>
      <svg className="rating-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Rating-Verlauf ${tcLabels[tc]}: von ${pts[0].rating} auf ${now}`}>
        <path className="rating-area" d={`${line}L${W},${H}L0,${H}Z`} />
        <path className="rating-line" d={line} />
      </svg>
      <div className="chart-axis">
        <span>{formatDate(pts[0].date)}</span>
        <span>{formatDate(pts.at(-1)!.date)}</span>
      </div>
      {classes.length > 1 && (
        <div className="chips" role="radiogroup" aria-label="Zeitklasse">
          {classes.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={c === tc} className="chip" onClick={() => setPick(c)}>
              {tcLabels[c]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

import { useMemo, useState } from 'react';
import { db, type GameRecord } from '../db/schema';
import { useLive } from '../db/useLive';
import { href } from '../app/router';
import { analysisQueue } from '../analysis/queue';
import { useQueueState } from '../analysis/useQueue';
import { countErrorTypes } from '../analysis/errorTypes';
import { todaysQueue } from '../training/leitner';
import { formatDate } from '../chess/format';
import { InfoTip } from '../components/InfoTip';
import { MIN_GAMES, RANGE_LABELS, RANGE_PHRASE, ratingSeries, segments, type RatingPoint, type RatingRange } from '../stats/rating';
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
  const allTypes = countErrorTypes(analyses);
  const totalErrors = allTypes.reduce((sum, e) => sum + e.count, 0);
  // Top 3 nur mit konkreten Fehlerarten; Fehler ohne klare Taktik als eigene Zeile darunter
  const errorTypes = allTypes.filter((e) => e.type !== 'other');
  const positional = allTypes.find((e) => e.type === 'other')?.count ?? 0;
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
          <p className="card-empty">{totalErrors ? 'Noch keine Fehler mit klarer Taktik gefunden.' : 'Erscheint, sobald Partien analysiert sind.'}</p>
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
        {positional > 0 && (
          <p className="card-hint positional" data-testid="positional-errors">
            Dazu {positional} {positional === 1 ? 'Fehler' : 'Fehler'} ohne klare Taktik (Stellung, Plan)
          </p>
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

/** Rating-Verlauf aus den importierten Chess.com-Partien: echte Zeitachse, Zeitraum wählbar, Lücken bei Pausen */
function RatingCard({ games }: { games: GameRecord[] }) {
  const series = useMemo(() => {
    const out: Record<string, RatingPoint[]> = {};
    for (const g of games) {
      if (g.source !== 'chesscom' || !g.myColor || !g.timeClass) continue;
      const r = g[g.myColor].rating;
      if (r === undefined) continue;
      (out[g.timeClass] ??= []).push({ date: g.date, rating: r });
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.date - b.date);
    return out;
  }, [games]);
  const classes = Object.keys(series).sort((a, b) => series[b].length - series[a].length);
  const [pick, setPick] = useState<string | null>(null);
  const [range, setRange] = useState<RatingRange>('4w');
  const tc = pick && classes.includes(pick) ? pick : classes[0];

  if (!tc) {
    return (
      <section className="card rating-card">
        <span className="eyebrow">Chess.com-Wertung</span>
        <p className="card-empty">Erscheint, sobald du Chess.com-Partien importiert hast.</p>
      </section>
    );
  }
  const all = series[tc];
  const now = Date.now();
  const s = ratingSeries(all, range, now);
  const name = tcLabels[tc];
  const current = all[all.length - 1].rating;
  const enough = s.games >= MIN_GAMES;

  const W = 600;
  const H = 160;
  const n = s.buckets.length;
  const ratings = s.buckets.map((b) => b.rating).filter((r): r is number => r !== null);
  const lo = Math.min(...ratings, current) - 10;
  const hi = Math.max(...ratings, current) + 10;
  // Punkt in der Mitte seines Tages bzw. seiner Woche
  const x = (i: number) => ((i + 0.5) / n) * W;
  const y = (r: number) => 10 + (1 - (r - lo) / Math.max(1, hi - lo)) * (H - 20);
  const segs = segments(s.buckets);

  return (
    <section className="card rating-card" data-testid="rating-card">
      <div className="card-head">
        <span className="rating-title">
          <span className="eyebrow">Chess.com</span>
          <span className="rating-label">
            {name}-Wertung
            <InfoTip
              label="Was ist die Wertung?"
              text="Deine Chess.com-Wertung (Rating). Sie steigt bei Siegen und sinkt bei Niederlagen. Jede Zeitklasse (Rapid, Blitz, Bullet, Täglich) hat ihre eigene Wertung."
            />
          </span>
        </span>
        {enough && s.delta !== null && (
          <span className={`delta ${s.delta >= 0 ? 'is-up' : 'is-down'}`} data-testid="rating-delta">
            {s.delta > 0 ? '+' : s.delta < 0 ? '−' : '±'}
            {Math.abs(s.delta)} {RANGE_PHRASE[range]}
          </span>
        )}
      </div>
      <div className="rating-now">
        <span className="num-l" data-testid="rating-now">
          {current}
        </span>
        {enough && s.best !== null && (
          <span className="card-hint" data-testid="rating-stats">
            Bestwert {s.best} · {s.games} {name}-Partien
          </span>
        )}
      </div>
      {enough ? (
        <>
          <svg
            className="rating-chart"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${name}-Wertung ${RANGE_PHRASE[range]}: ${s.delta !== null && s.delta >= 0 ? 'plus' : 'minus'} ${Math.abs(s.delta ?? 0)}`}
            data-testid="rating-chart"
            data-segments={segs.length}
          >
            {segs.map((seg, k) =>
              seg.length === 1 ? (
                <circle key={k} className="rating-point" cx={x(seg[0].index)} cy={y(seg[0].rating)} r="4" />
              ) : (
                <g key={k}>
                  <path
                    className="rating-area"
                    d={`M${x(seg[0].index)},${H} ${seg.map((p) => `L${x(p.index).toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ')} L${x(seg[seg.length - 1].index)},${H}Z`}
                  />
                  <path className="rating-line" d={seg.map((p, i) => `${i ? 'L' : 'M'}${x(p.index).toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ')} />
                </g>
              ),
            )}
          </svg>
          <div className="chart-axis">
            <span>{formatDate(s.from)}</span>
            <span>{s.unit === 'day' ? 'ein Punkt pro Tag' : 'ein Punkt pro Woche'}</span>
            <span>heute</span>
          </div>
        </>
      ) : (
        <p className="card-empty rating-few" data-testid="rating-few">
          Zu wenige Partien in diesem Zeitraum ({s.games} {name}-{s.games === 1 ? 'Partie' : 'Partien'}).
        </p>
      )}
      <div className="rating-controls">
        <div className="chips" role="radiogroup" aria-label="Zeitraum">
          {(Object.keys(RANGE_LABELS) as RatingRange[]).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={r === range} className="chip" onClick={() => setRange(r)}>
              {RANGE_LABELS[r]}
            </button>
          ))}
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
      </div>
    </section>
  );
}

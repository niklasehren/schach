import { analysisQueue } from '../analysis/queue';
import { useQueueState } from '../analysis/useQueue';
import { formatDate } from '../chess/format';

function duration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'unter 1 Minute';
  if (min < 60) return `etwa ${min} Minute${min === 1 ? '' : 'n'}`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return `etwa ${h} Std.${rest ? ` ${rest} Min.` : ''}`;
}

/** Stand der Hintergrund-Analyse mit Pause/Weiter – ehrlich: läuft nur bei geöffneter App */
export function AnalysisPanel() {
  const s = useQueueState();
  if (s.total === 0) return null;
  const left = s.total - s.processed;
  const finished = left === 0;
  const label =
    s.status === 'paused'
      ? 'pausiert'
      : s.status === 'yielding'
        ? 'wartet, solange du gegen den Computer spielst'
        : finished
          ? 'alle Partien analysiert'
          : s.current
            ? `läuft – Partie vom ${formatDate(s.current.date)}, Stellung ${Math.min(s.current.position + 1, s.current.positions)} von ${s.current.positions}`
            : 'startet …';

  return (
    <section className="analysis-panel" aria-label="Analyse" data-testid="analysis-panel">
      <div className="analysis-head">
        <span className="analysis-count" data-testid="analysis-count">
          Analyse: {s.processed} von {s.total} Partien
        </span>
        {!finished && (
          <button
            className="btn btn-small"
            onClick={() => (s.status === 'paused' ? analysisQueue.resume() : analysisQueue.pause())}
            data-testid="analysis-toggle"
          >
            {s.status === 'paused' ? 'Weiter' : 'Pause'}
          </button>
        )}
      </div>
      <progress max={Math.max(1, s.total)} value={s.processed} />
      <span className="analysis-status" data-testid="analysis-status">
        {label}
      </span>
      {!finished && (
        <span className="analysis-note">
          Die Analyse läuft nur, solange die App geöffnet ist (am Handy: im Vordergrund). Beim nächsten Öffnen geht es an derselben Stelle weiter.
          {s.avgMs !== null && ` Bisher ${Math.round(s.avgMs / 1000)} s pro Partie auf diesem Gerät, noch ${duration(left * s.avgMs)}.`}
        </span>
      )}
    </section>
  );
}

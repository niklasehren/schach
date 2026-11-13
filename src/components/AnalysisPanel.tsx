import { analysisQueue } from '../analysis/queue';
import { useQueueState } from '../analysis/useQueue';
import { formatDate } from '../chess/format';
import { Progress } from '@/components/ui/progress';

function duration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'unter 1 Minute';
  if (min < 60) return `etwa ${min} Minute${min === 1 ? '' : 'n'}`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return `etwa ${h} Std.${rest ? ` ${rest} Min.` : ''}`;
}

/** Stand der Hintergrund-Analyse als ruhige Zeile; Pause/Weiter nur, solange noch Partien offen sind – ehrlich: läuft nur bei geöffneter App */
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
        : s.current
            ? `läuft – Partie vom ${formatDate(s.current.date)}, Stellung ${Math.min(s.current.position + 1, s.current.positions)} von ${s.current.positions}`
            : 'startet …';

  if (finished) {
    return (
      <p className="text-[15px] text-muted-foreground" aria-label="Analyse" data-testid="analysis-panel">
        <span data-testid="analysis-count">Alle Partien analysiert</span>
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-2 text-[15px] text-muted-foreground" aria-label="Analyse" data-testid="analysis-panel">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-foreground tabular-nums" data-testid="analysis-count">
          Analyse: {s.processed} von {s.total} Partien
        </span>
        <span>–</span>
        <span data-testid="analysis-status">{label}</span>
        <button
          type="button"
          className="ml-1 font-semibold text-brass-text hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => (s.status === 'paused' ? analysisQueue.resume() : analysisQueue.pause())}
          data-testid="analysis-toggle"
        >
          {s.status === 'paused' ? 'Weiter' : 'Pause'}
        </button>
      </p>
      <Progress value={s.total ? (s.processed / s.total) * 100 : 0} aria-label="Analyse-Fortschritt" className="h-1 max-w-md" />
      <p className="max-w-[70ch] text-sm">
        Die Analyse läuft nur, solange die App geöffnet ist (am Handy: im Vordergrund). Beim nächsten Öffnen geht es an derselben Stelle weiter.
        {s.avgMs !== null && ` Bisher ${Math.round(s.avgMs / 1000)} s pro Partie auf diesem Gerät, noch ${duration(left * s.avgMs)}.`}
      </p>
    </section>
  );
}

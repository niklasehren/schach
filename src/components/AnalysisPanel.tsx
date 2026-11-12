import { analysisQueue } from '../analysis/queue';
import { useQueueState } from '../analysis/useQueue';
import { formatDate } from '../chess/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

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
    <Card size="sm" className="gap-2 px-4" aria-label="Analyse" data-testid="analysis-panel">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold tabular-nums" data-testid="analysis-count">
          Analyse: {s.processed} von {s.total} Partien
        </span>
        {!finished && (
          <Button variant="outline" size="sm" onClick={() => (s.status === 'paused' ? analysisQueue.resume() : analysisQueue.pause())} data-testid="analysis-toggle">
            {s.status === 'paused' ? 'Weiter' : 'Pause'}
          </Button>
        )}
      </div>
      <Progress value={s.total ? (s.processed / s.total) * 100 : 0} aria-label="Analyse-Fortschritt" />
      <span className="text-[15px]" data-testid="analysis-status">
        {label}
      </span>
      {!finished && (
        <span className="text-sm text-muted-foreground">
          Die Analyse läuft nur, solange die App geöffnet ist (am Handy: im Vordergrund). Beim nächsten Öffnen geht es an derselben Stelle weiter.
          {s.avgMs !== null && ` Bisher ${Math.round(s.avgMs / 1000)} s pro Partie auf diesem Gerät, noch ${duration(left * s.avgMs)}.`}
        </span>
      )}
    </Card>
  );
}

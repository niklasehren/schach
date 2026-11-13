import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { href, type PuzzleFilter } from '../app/router';
import { db, type Phase, type PuzzleRecord, type Side } from '../db/schema';
import { useLive } from '../db/useLive';
import { PHASE_LABELS } from '../db/boardGames';
import { filteredQueue, isEmptyFilter, matchesFilter, tagPuzzles, type PuzzleTags } from '../training/filter';
import { openingLabel } from '../stats/openings';
import { Choice } from '@/components/Section';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Puzzles mit ihren Merkmalen (Phase, Eröffnung, Farbe, Zeitnot) */
function useTagged(): { puzzles: PuzzleRecord[]; tags: Map<string, PuzzleTags> } | null {
  const puzzles = useLive(() => db.puzzles.toArray(), []);
  const games = useLive(() => db.games.toArray(), []);
  const analyses = useLive(() => db.analyses.where('status').equals('done').toArray(), []);
  const tags = useMemo(() => (puzzles && games && analyses ? tagPuzzles(puzzles, games, analyses) : null), [puzzles, games, analyses]);
  return puzzles && tags ? { puzzles, tags } : null;
}

/** Kurzbeschreibung eines Filters: „Endspiel, Französisch mit Schwarz“ */
export function filterText(f: PuzzleFilter): string {
  const parts: string[] = [];
  if (f.phase) parts.push(PHASE_LABELS[f.phase]);
  if (f.opening) parts.push(openingLabel(f.opening) + (f.color ? ` mit ${f.color === 'white' ? 'Weiß' : 'Schwarz'}` : ''));
  else if (f.color) parts.push(`mit ${f.color === 'white' ? 'Weiß' : 'Schwarz'}`);
  if (f.zeitnot) parts.push('in Zeitnot');
  return parts.join(', ') || 'alle';
}

/** Auf der Trainingsseite: meine Fehler gezielt üben (Phase, Farbe, Eröffnung, Zeitnot) */
export function PuzzleFilterSection() {
  const data = useTagged();
  const [phase, setPhase] = useState<Phase | 'all'>('all');
  const [color, setColor] = useState<Side | 'all'>('all');
  const [opening, setOpening] = useState('all');
  const [zeitnot, setZeitnot] = useState<'all' | 'yes'>('all');
  if (!data || data.puzzles.length === 0) return null;

  const f: PuzzleFilter = { phase: phase === 'all' ? undefined : phase, color: color === 'all' ? undefined : color, opening: opening === 'all' ? undefined : opening, zeitnot: zeitnot === 'yes' || undefined };
  const count = data.puzzles.filter((p) => matchesFilter(data.tags.get(p.id), f)).length;
  // Eröffnungen mit Anzahl (unter den übrigen Filtern)
  const openings = new Map<string, number>();
  for (const p of data.puzzles) {
    const t = data.tags.get(p.id);
    if (t?.opening && matchesFilter(t, { ...f, opening: undefined })) openings.set(t.opening, (openings.get(t.opening) ?? 0) + 1);
  }
  const openingList = [...openings.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <section className="mt-12 border-t pt-8" aria-labelledby="filter-title" data-testid="puzzle-filter">
      <h2 id="filter-title" className="font-heading text-[28px] leading-tight font-normal">
        Meine Fehler gezielt üben
      </h2>
      <p className="mt-1 max-w-[68ch] text-[15px] text-muted-foreground">Nur Puzzles aus einer Spielphase, einer Eröffnung oder aus Zeitnot – zum Beispiel, wenn die Statistik dort eine Schwäche zeigt.</p>
      <div className="mt-5 flex flex-col gap-3">
        <Row label="Phase">
          <Choice label="Spielphase" value={phase} onChange={setPhase} options={[{ value: 'all', label: 'Alle' }, ...(['opening', 'middlegame', 'endgame'] as Phase[]).map((p) => ({ value: p, label: PHASE_LABELS[p] }))]} />
        </Row>
        <Row label="Farbe">
          <Choice
            label="Farbe"
            value={color}
            onChange={setColor}
            options={[
              { value: 'all', label: 'Alle' },
              { value: 'white', label: 'Weiß' },
              { value: 'black', label: 'Schwarz' },
            ]}
          />
        </Row>
        <Row label="Eröffnung">
          <select
            aria-label="Eröffnung"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            className="h-10 max-w-full min-w-0 rounded-md border bg-background px-2 text-[15px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            data-testid="filter-opening"
          >
            <option value="all">Alle</option>
            {opening !== 'all' && !openings.has(opening) && <option value={opening}>{openingLabel(opening)} (0)</option>}
            {openingList.map(([fam, n]) => (
              <option key={fam} value={fam}>
                {openingLabel(fam)} ({n})
              </option>
            ))}
          </select>
        </Row>
        <Row label="Zeitnot">
          <Choice
            label="Zeitnot"
            value={zeitnot}
            onChange={setZeitnot}
            options={[
              { value: 'all', label: 'Egal' },
              { value: 'yes', label: 'Nur in Zeitnot' },
            ]}
          />
        </Row>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        {count > 0 ? (
          <a
            className={cn(buttonVariants({ size: 'lg' }), 'h-11 bg-brass px-5 text-[15px] font-bold text-brass-foreground no-underline hover:bg-brass/90')}
            href={href({ page: 'training', mode: 'auswahl', filter: f })}
            data-testid="filter-start"
          >
            {count} {count === 1 ? 'Puzzle' : 'Puzzles'} üben
          </a>
        ) : (
          <span className="text-[15px] text-muted-foreground" data-testid="filter-empty">
            Keine Puzzles für diese Auswahl.
          </span>
        )}
        {!isEmptyFilter(f) && <span className="text-[15px] text-muted-foreground">Auswahl: {filterText(f)}</span>}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-[15px] text-muted-foreground sm:w-24 sm:shrink-0">{label}</span>
      {children}
    </div>
  );
}

const exitToHub = () => (window.location.hash = href({ page: 'training' }));

/** Gefiltertes Üben: fällige zuerst, dann neue, dann schon geübte; Leitner-Planung wie sonst */
export function FilteredSession({
  filter,
  render,
}: {
  filter: PuzzleFilter;
  render: (p: { puzzle: PuzzleRecord; status: string; hasNext: boolean; onNext: () => void; onExit: () => void }) => ReactNode;
}) {
  const data = useTagged();
  const [done, setDone] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  // Reihenfolge einmal festlegen, damit gelöste Puzzles nicht wieder hinten auftauchen
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => {
    if (data && order === null) setOrder(filteredQueue(data.puzzles, data.tags, filter, Date.now()).map((p) => p.id));
  }, [data, order, filter]);
  const list = (order ?? []).filter((id) => !done.includes(id));
  useEffect(() => {
    if (order && current === null && list[0]) setCurrent(list[0]);
  }, [order, current, list]);

  if (!data || order === null) return <p className="text-muted-foreground">Lädt …</p>;
  const active = data.puzzles.find((p) => p.id === current);
  if (order.length === 0 || !active) {
    return (
      <div className="flex w-full max-w-[760px] flex-col gap-4 px-4 md:px-0" data-testid="filter-none">
        <h1 className="font-heading text-4xl leading-tight">Keine Puzzles für diese Auswahl</h1>
        <p className="text-muted-foreground">Auswahl: {filterText(filter)}. Puzzles entstehen aus deinen Fehlern, sobald die Partien analysiert sind.</p>
        <a className="self-start font-semibold text-brass-text no-underline hover:underline" href={href({ page: 'training' })}>
          Zum Training
        </a>
      </div>
    );
  }
  const remaining = list.filter((id) => id !== active.id).length;
  return render({
    puzzle: active,
    status: `${filterText(filter)}: noch ${remaining}`,
    hasNext: remaining > 0,
    onNext: () => {
      setDone((d) => [...d, active.id]);
      setCurrent(list.find((id) => id !== active.id) ?? null);
    },
    onExit: exitToHub,
  });
}

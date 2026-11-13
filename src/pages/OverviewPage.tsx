import { Download, NotebookPen, Swords } from 'lucide-react';
import { href } from '../app/router';
import { analysisQueue } from '../analysis/queue';
import { formatDate } from '../chess/format';
import { MiniBoard } from '../components/MiniBoard';
import { InstallHintBanner } from '../components/InstallHint';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useOverview, type OverviewData } from './overview/useOverview';
import { RatingTrend } from './overview/RatingTrend';
import { EndBoard, errorsText, gameHref, myErrors, opponentOf, resultColor, resultWord, shortDate, TrendMark } from './overview/parts';

const brassButton = 'h-12 bg-brass px-6 text-base font-bold text-brass-foreground no-underline hover:bg-brass/90';
const heroLink = 'text-base text-hero-foreground underline decoration-hero-foreground/50 underline-offset-4 hover:decoration-hero-foreground';
const sectionTitle = 'font-heading text-[28px] leading-tight font-normal';

/**
 * Übersicht „Klubraum“: grünes Band mit dem heutigen Training (Brett + Start), darunter der Coach als großer Satz,
 * Wertung und häufigste Fehler nebeneinander, letzte Partien als Reihe kleiner Bretter. Keine Kästen, nur Abstand und feine Linien.
 */
export function OverviewPage() {
  const d = useOverview();
  if (!d) return <p className="text-muted-foreground">Lädt …</p>;
  if (d.games.length === 0) return <Welcome />;
  return (
    <div className="flex w-full max-w-[1120px] animate-in flex-col px-4 fade-in-0 md:px-0">
      <InstallHintBanner />
      <Today d={d} />
      <CoachSection d={d} />
      <section className="grid gap-12 border-t pt-8 md:grid-cols-[1.45fr_1fr] md:gap-14">
        <RatingTrend games={d.games} />
        <Errors d={d} />
      </section>
      <RecentGames d={d} />
      <AnalysisLine d={d} />
    </div>
  );
}

function Welcome() {
  return (
    <div className="flex w-full max-w-[1120px] flex-col px-4 md:px-0">
      <InstallHintBanner />
      <section className="mt-2 flex flex-col gap-5 rounded-2xl bg-hero p-6 text-hero-foreground md:p-10">
        <h1 className="font-heading text-[44px] leading-[1.02] font-normal md:text-[64px]">Dein persönlicher Schachberater</h1>
        <p className="max-w-xl text-[17px] leading-relaxed text-hero-muted">Lade deine Chess.com-Partien oder spiel eine Partie. Die App findet deine Fehler und macht daraus Training.</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <a className={cn(buttonVariants({ size: 'lg' }), brassButton)} href={href({ page: 'import' })}>
            <Download data-icon="inline-start" /> Chess.com-Partien laden
          </a>
          <a className={cn(heroLink, 'inline-flex items-center gap-2')} href={href({ page: 'spielen' })}>
            <Swords className="size-4" /> Partie spielen
          </a>
          <a className={cn(heroLink, 'inline-flex items-center gap-2')} href={href({ page: 'brett' })}>
            <NotebookPen className="size-4" /> Brettpartie eintragen
          </a>
        </div>
      </section>
    </div>
  );
}

/** Heute: Brett mit der ersten Stellung (antippen startet sie), Anzahl, Schwerpunkt, Start */
function Today({ d }: { d: OverviewData }) {
  const p = d.preview;
  const general = href({ page: 'training', mode: 'allgemein', theme: 'schwaechen' });
  // Nichts fällig: Das Brett zeigt eine Stellung aus dem Allgemeinen Training, also startet der Hauptknopf dieses
  const startHref = d.due ? href({ page: 'training', mode: 'fehler' }) : general;
  return (
    <section className="grid gap-6 rounded-2xl bg-hero p-4 text-hero-foreground sm:p-6 md:grid-cols-[minmax(0,340px)_1fr] md:gap-10 md:p-8" aria-labelledby="today-title">
      <a href={startHref} className="block rounded-lg focus-visible:ring-3 focus-visible:ring-brass focus-visible:outline-none" aria-label="Diese Stellung lösen" data-testid="overview-board">
        {p ? (
          <MiniBoard fen={p.fen} orientation={p.orientation} lastMove={p.lastMove} coordinates className="w-full cursor-pointer rounded-lg shadow-[0_18px_40px_rgba(0,0,0,0.35)]" />
        ) : (
          <div className="aspect-square w-full rounded-lg bg-hero-foreground/10" />
        )}
      </a>
      <div className="flex flex-col justify-center gap-5">
        {d.due ? (
          <h1 id="today-title" className="font-heading text-[56px] leading-[0.95] font-normal md:text-[76px]">
            <span data-testid="overview-due">{d.due}</span> {d.due === 1 ? 'Puzzle' : 'Puzzles'}
            <br />
            für heute
          </h1>
        ) : (
          <h1 id="today-title" className="font-heading text-[52px] leading-[0.95] font-normal md:text-[68px]" data-testid="overview-goal">
            {d.puzzles.length ? 'Tagesziel geschafft' : 'Noch keine Puzzles'}
          </h1>
        )}
        <p className="max-w-md text-[17px] leading-relaxed text-hero-muted" data-testid="overview-practiced">
          {d.due
            ? `${d.fresh} neue aus deinen Fehlern${d.repeats ? `, ${d.repeats} zum Wiederholen` : ''}.`
            : d.puzzles.length
              ? `Heute geübt: ${d.practiced} ${d.practiced === 1 ? 'Puzzle' : 'Puzzles'}. Die Stellung stammt aus dem Allgemeinen Training.`
              : 'Puzzles aus deinen Fehlern entstehen, sobald deine Partien analysiert sind. Bis dahin: Allgemeines Training.'}
          {p?.topic && (
            <>
              {' '}
              {p.source === 'mine' ? 'Schwerpunkt' : 'Thema'}: <span className="text-hero-foreground">{p.topic}</span>.
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <a className={cn(buttonVariants({ size: 'lg' }), brassButton)} href={startHref} data-testid="overview-start">
            {d.due ? 'Training starten' : 'Allgemeines Training'}
          </a>
          {d.due ? (
            <a className={heroLink} href={general} data-testid="overview-start-general">
              Allgemeines Training
            </a>
          ) : (
            d.practice > 0 && (
              <a className={heroLink} href={href({ page: 'training', mode: 'mehr' })} data-testid="overview-start-more">
                Weiter mit meinen Fehlern ({d.practice})
              </a>
            )
          )}
        </div>
        <p className="text-[15px] text-hero-muted">
          {p?.game ? <>Erstes Puzzle aus deiner Partie gegen {opponentOf(p.game)} vom {formatDate(p.game.date)}. </> : null}
          Puzzle-Rating{' '}
          <span className="text-hero-foreground tabular-nums" data-testid="overview-puzzle-rating">
            {d.puzzleRating ?? '…'}
          </span>
        </p>
      </div>
    </section>
  );
}

function CoachSection({ d }: { d: OverviewData }) {
  const c = d.coach;
  return (
    <section className="py-10 md:py-14" data-testid="coach">
      <p className="max-w-[30ch] font-heading text-[30px] leading-[1.15] md:max-w-[34ch] md:text-[40px]" data-testid="coach-blunders">
        {c.blunders}
      </p>
      {(c.focus || c.advice) && (
        <p className="mt-4 max-w-[62ch] text-[17px] leading-relaxed text-muted-foreground" data-testid="coach-focus">
          {c.focus} {c.advice}{' '}
          {c.theme && (
            <a className="font-semibold text-brass-text no-underline hover:underline" href={href({ page: 'training', mode: 'allgemein', theme: c.theme })} data-testid="coach-practice">
              Jetzt üben
            </a>
          )}
        </p>
      )}
    </section>
  );
}

function Errors({ d }: { d: OverviewData }) {
  return (
    <div>
      <h2 className={sectionTitle}>Was dich am meisten kostet</h2>
      {d.errors.length === 0 ? (
        <p className="mt-3 text-muted-foreground">{d.totalErrors ? 'Noch keine Fehler mit klarer Taktik gefunden.' : 'Erscheint, sobald Partien analysiert sind.'}</p>
      ) : (
        <ol className="mt-3 flex list-none flex-col p-0" data-testid="error-types">
          {d.errors.slice(0, 4).map((e) => (
            <li key={e.type} className="flex items-baseline gap-3 border-t py-2.5 first:border-t-0">
              <span className="w-9 shrink-0 text-right font-heading text-[26px] leading-none tabular-nums">{e.count}</span>
              <span className="min-w-0 flex-1">{e.label}</span>
              <TrendMark trend={e.trend} />
            </li>
          ))}
        </ol>
      )}
      {d.positional > 0 && (
        <p className="mt-2 text-[15px] text-muted-foreground" data-testid="positional-errors">
          Dazu {d.positional} Stellungsfehler ohne klare Taktik.
        </p>
      )}
    </div>
  );
}

function RecentGames({ d }: { d: OverviewData }) {
  return (
    <section className="mt-12 border-t pt-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className={sectionTitle}>Letzte Partien</h2>
        <span className="flex gap-5 text-[15px]">
          <a className="inline-flex items-center gap-1.5 text-muted-foreground no-underline hover:text-foreground" href={href({ page: 'brett' })} data-testid="overview-board-entry">
            <NotebookPen className="size-4" /> Brettpartie eintragen
          </a>
          <a className="text-muted-foreground no-underline hover:text-foreground" href={href({ page: 'partien' })}>
            Alle Partien
          </a>
        </span>
      </div>
      <ul className="-mx-4 flex list-none snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0" data-testid="recent-games">
        {d.games.slice(0, 5).map((g) => {
          const errs = errorsText(myErrors(g, d.byId.get(g.id)));
          return (
            <li key={g.id} className="w-[42vw] max-w-52 shrink-0 snap-start md:w-auto md:max-w-none">
              <a href={gameHref(g)} className="group flex flex-col gap-2 rounded-md text-inherit no-underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" data-testid="game-row">
                <div className="relative overflow-hidden rounded-md">
                  <EndBoard game={g} className="w-full transition-opacity group-hover:opacity-90" />
                  <span className={cn('absolute inset-x-0 bottom-0 h-1', resultColor(g.myResult))} aria-hidden />
                </div>
                <span className="flex flex-col">
                  <span className="truncate font-semibold">{opponentOf(g)}</span>
                  <span className="text-[15px] text-muted-foreground tabular-nums">
                    {g.myResult ? resultWord[g.myResult] : g.result}, {shortDate(g.date)}
                    {errs && <span data-testid="game-errors">, {errs}</span>}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AnalysisLine({ d }: { d: OverviewData }) {
  const q = d.queue;
  const done = q.processed >= q.total;
  return (
    <p className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-4 text-[15px] text-muted-foreground" data-testid="overview-analysis">
      <span>
        {done ? `Alle ${q.total} Partien analysiert.` : `${q.processed} von ${q.total} Partien analysiert, ${q.status === 'paused' ? 'pausiert' : 'läuft, solange die App offen ist'}.`}
      </span>
      {!done && (
        <button type="button" className="font-semibold text-brass-text hover:underline" onClick={() => (q.status === 'paused' ? analysisQueue.resume() : analysisQueue.pause())}>
          {q.status === 'paused' ? 'Weiter analysieren' : 'Pause'}
        </button>
      )}
    </p>
  );
}

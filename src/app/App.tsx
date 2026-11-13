import { lazy, Suspense, useEffect, useState } from 'react';
import { analysisQueue } from '../analysis/queue';
import { backfillErrorTypes } from '../analysis/errorTypes';
import { maybeAutoImport } from '../chesscom/autoImport';
import { ChessKnight, Download, House, List, Settings, Target, type LucideIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { href, useRoute, type Route } from './router';
import { UpdatePrompt } from '../components/UpdatePrompt';

// Seiten erst bei Bedarf laden (kleineres Start-Paket)
const OverviewPage = lazy(() => import('../pages/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const PlayPage = lazy(() => import('../pages/PlayPage').then((m) => ({ default: m.PlayPage })));
const GamesPage = lazy(() => import('../pages/GamesPage').then((m) => ({ default: m.GamesPage })));
const GameViewPage = lazy(() => import('../pages/GameViewPage').then((m) => ({ default: m.GameViewPage })));
const TrainingPage = lazy(() => import('../pages/TrainingPage').then((m) => ({ default: m.TrainingPage })));
const ImportPage = lazy(() => import('../pages/ImportPage').then((m) => ({ default: m.ImportPage })));
const BoardEntryPage = lazy(() => import('../pages/BoardEntryPage').then((m) => ({ default: m.BoardEntryPage })));
const SettingsPage = lazy(() => import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const links: { route: Route; label: string; icon: LucideIcon; match: Route['page'][] }[] = [
  { route: { page: 'uebersicht' }, label: 'Übersicht', icon: House, match: ['uebersicht'] },
  { route: { page: 'spielen' }, label: 'Spielen', icon: ChessKnight, match: ['spielen'] },
  { route: { page: 'partien' }, label: 'Partien', icon: List, match: ['partien', 'partie', 'brett'] },
  { route: { page: 'training' }, label: 'Training', icon: Target, match: ['training'] },
  { route: { page: 'import' }, label: 'Import', icon: Download, match: ['import'] },
];

export function App() {
  const route = useRoute();
  // Spielen und Import erst beim ersten Besuch laden, danach im Hintergrund erhalten
  const [visited, setVisited] = useState(() => new Set<Route['page']>([route.page]));
  useEffect(() => {
    setVisited((v) => (v.has(route.page) ? v : new Set(v).add(route.page)));
  }, [route.page]);
  // Hintergrund-Analyse starten (läuft, solange die App offen ist); Fehlerarten für ältere Analysen nachtragen
  useEffect(() => {
    void analysisQueue.start();
    const t = window.setTimeout(() => void backfillErrorTypes(), 1500);
    return () => window.clearTimeout(t);
  }, []);

  // Neue Chess.com-Partien automatisch holen: beim Öffnen und wenn der Tab wieder sichtbar wird
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const added = await maybeAutoImport();
      if (added > 0) {
        setToast(added === 1 ? '1 neue Partie geladen' : `${added} neue Partien geladen`);
        clearTimeout(timer);
        timer = setTimeout(() => setToast(null), 6000);
      }
    };
    void check();
    document.addEventListener('visibilitychange', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      clearTimeout(timer);
    };
  }, []);

  return (
    <TooltipProvider delay={250}>
    <div className="flex min-h-dvh flex-col pr-[env(safe-area-inset-right)] pb-[calc(4.5rem+env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] md:pb-0">
      <header className="sticky top-0 z-30 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 md:h-16 md:px-7">
          <a className="font-heading text-[28px] leading-none text-foreground no-underline" href={href({ page: 'uebersicht' })}>
            Schach
          </a>
          <nav className="hidden items-center gap-1 self-stretch md:flex" aria-label="Hauptnavigation">
            {links.map((l) => {
              const active = l.match.includes(route.page);
              return (
                <a
                  key={l.label}
                  href={href(l.route)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex h-16 items-center gap-2 px-3 text-[15px] font-medium no-underline transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    active ? 'text-brass-text after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brass' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <l.icon className="size-[18px]" strokeWidth={1.9} />
                  {l.label}
                </a>
              );
            })}
          </nav>
          <a
            className={cn(buttonVariants({ variant: 'outline', size: 'icon-lg' }), 'ml-auto text-foreground', route.page === 'einstellungen' && 'border-ring')}
            href={href({ page: 'einstellungen' })}
            aria-label="Einstellungen"
            title="Einstellungen"
          >
            <Settings />
          </a>
        </div>
      </header>

      {toast && (
        <div
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 animate-in rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg fade-in-0 slide-in-from-bottom-2 md:bottom-6"
          role="status"
          data-testid="toast"
        >
          {toast}
        </div>
      )}

      <main className="flex flex-1 justify-center pt-3 pb-5 md:px-7 md:pt-6 md:pb-10">
        <Suspense fallback={<p className="text-muted-foreground">Lädt …</p>}>
          {/* Spielen und Import bleiben im Hintergrund erhalten: laufende Partie bzw. laufender Import gehen beim Seitenwechsel nicht verloren */}
          {visited.has('spielen') && (
            <div className="page-slot" hidden={route.page !== 'spielen'}>
              <PlayPage active={route.page === 'spielen'} />
            </div>
          )}
          {visited.has('import') && (
            <div className="page-slot" hidden={route.page !== 'import'}>
              <ImportPage />
            </div>
          )}
          {route.page === 'uebersicht' && <OverviewPage />}
          {route.page === 'partien' && <GamesPage />}
          {route.page === 'partie' && <GameViewPage id={route.id} ply={route.ply} />}
          {route.page === 'training' && <TrainingPage mode={route.mode} theme={route.theme} />}
          {route.page === 'einstellungen' && <SettingsPage />}
          {route.page === 'brett' && <BoardEntryPage key={route.id ?? 'neu'} id={route.id} />}
        </Suspense>
      </main>

      {/* Am Handy: Navigation als Leiste unten, mit dem Daumen erreichbar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 pt-1 pr-[calc(0.25rem+env(safe-area-inset-right))] pb-[calc(0.25rem+env(safe-area-inset-bottom))] pl-[calc(0.25rem+env(safe-area-inset-left))] backdrop-blur md:hidden"
        aria-label="Hauptnavigation unten"
      >
        {links.map((l) => {
          const active = l.match.includes(route.page);
          return (
            <a
              key={l.label}
              href={href(l.route)}
              aria-current={active ? 'page' : undefined}
              className={cn('flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs font-semibold no-underline', active ? 'text-brass-text' : 'text-muted-foreground')}
            >
              <l.icon className="size-6" strokeWidth={1.8} />
              {l.label}
            </a>
          );
        })}
      </nav>
      <UpdatePrompt />
    </div>
    </TooltipProvider>
  );
}

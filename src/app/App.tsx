import { useEffect, useState } from 'react';
import { analysisQueue } from '../analysis/queue';
import { backfillErrorTypes } from '../analysis/errorTypes';
import { maybeAutoImport } from '../chesscom/autoImport';
import { ChessKnight, Download, House, List, Settings, Target, type LucideIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GamesPage } from '../pages/GamesPage';
import { GameViewPage } from '../pages/GameViewPage';
import { ImportPage } from '../pages/ImportPage';
import { OverviewPage } from '../pages/OverviewPage';
import { PlayPage } from '../pages/PlayPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TrainingPage } from '../pages/TrainingPage';
import { href, useRoute, type Route } from './router';

const links: { route: Route; label: string; icon: LucideIcon; match: Route['page'][] }[] = [
  { route: { page: 'uebersicht' }, label: 'Übersicht', icon: House, match: ['uebersicht'] },
  { route: { page: 'spielen' }, label: 'Spielen', icon: ChessKnight, match: ['spielen'] },
  { route: { page: 'partien' }, label: 'Partien', icon: List, match: ['partien', 'partie'] },
  { route: { page: 'training' }, label: 'Training', icon: Target, match: ['training'] },
  { route: { page: 'import' }, label: 'Import', icon: Download, match: ['import'] },
];

export function App() {
  const route = useRoute();
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
    <div className="flex min-h-dvh flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-30 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 md:h-16 md:px-7">
          <a className="font-heading text-[28px] leading-none text-foreground no-underline" href={href({ page: 'uebersicht' })}>
            Schach
          </a>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Hauptnavigation">
            {links.map((l) => {
              const active = l.match.includes(route.page);
              return (
                <a
                  key={l.label}
                  href={href(l.route)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(buttonVariants({ variant: active ? 'default' : 'ghost', size: 'lg' }), 'rounded-full px-3.5 text-[15px] no-underline', !active && 'text-muted-foreground')}
                >
                  <l.icon data-icon="inline-start" />
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

      <main className="main">
        {/* Spielen und Import bleiben im Hintergrund erhalten: laufende Partie bzw. laufender Import gehen beim Seitenwechsel nicht verloren */}
        <div className="page-slot" hidden={route.page !== 'spielen'}>
          <PlayPage active={route.page === 'spielen'} />
        </div>
        <div className="page-slot" hidden={route.page !== 'import'}>
          <ImportPage />
        </div>
        {route.page === 'uebersicht' && <OverviewPage />}
        {route.page === 'partien' && <GamesPage />}
        {route.page === 'partie' && <GameViewPage id={route.id} ply={route.ply} />}
        {route.page === 'training' && <TrainingPage />}
        {route.page === 'einstellungen' && <SettingsPage />}
      </main>

      {/* Am Handy: Navigation als Leiste unten, mit dem Daumen erreichbar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden"
        aria-label="Hauptnavigation unten"
      >
        {links.map((l) => {
          const active = l.match.includes(route.page);
          return (
            <a
              key={l.label}
              href={href(l.route)}
              aria-current={active ? 'page' : undefined}
              className={cn('flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11.5px] font-semibold no-underline', active ? 'text-primary' : 'text-muted-foreground')}
            >
              <l.icon className="size-6" strokeWidth={1.8} />
              {l.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

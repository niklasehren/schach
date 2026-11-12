import { useEffect, useState } from 'react';
import { analysisQueue } from '../analysis/queue';
import { backfillErrorTypes } from '../analysis/errorTypes';
import { maybeAutoImport } from '../chesscom/autoImport';
import { Icon, type IconName } from '../components/Icons';
import { GamesPage } from '../pages/GamesPage';
import { GameViewPage } from '../pages/GameViewPage';
import { ImportPage } from '../pages/ImportPage';
import { OverviewPage } from '../pages/OverviewPage';
import { PlayPage } from '../pages/PlayPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TrainingPage } from '../pages/TrainingPage';
import { href, useRoute, type Route } from './router';

const links: { route: Route; label: string; icon: IconName; match: Route['page'][] }[] = [
  { route: { page: 'uebersicht' }, label: 'Übersicht', icon: 'home', match: ['uebersicht'] },
  { route: { page: 'spielen' }, label: 'Spielen', icon: 'play', match: ['spielen'] },
  { route: { page: 'partien' }, label: 'Partien', icon: 'list', match: ['partien', 'partie'] },
  { route: { page: 'training' }, label: 'Training', icon: 'target', match: ['training'] },
  { route: { page: 'import' }, label: 'Import', icon: 'import', match: ['import'] },
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

  const navItems = (variant: 'top' | 'bottom') =>
    links.map((l) => {
      const active = l.match.includes(route.page);
      return (
        <a key={l.label} className={`nav-link ${active ? 'is-active' : ''}`} href={href(l.route)} aria-current={active ? 'page' : undefined}>
          <Icon name={l.icon} size={variant === 'bottom' ? 24 : 19} />
          <span>{l.label}</span>
        </a>
      );
    });

  return (
    <div className="app">
      <header className="topbar">
        <a className="wordmark" href={href({ page: 'uebersicht' })}>
          Schach
        </a>
        <nav className="nav nav-top" aria-label="Hauptnavigation">
          {navItems('top')}
        </nav>
        <a
          className={`icon-link settings-link ${route.page === 'einstellungen' ? 'is-active' : ''}`}
          href={href({ page: 'einstellungen' })}
          aria-label="Einstellungen"
          title="Einstellungen"
        >
          <Icon name="settings" size={21} />
        </a>
      </header>
      {toast && (
        <div className="toast" role="status" data-testid="toast">
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
      <nav className="nav nav-bottom" aria-label="Hauptnavigation unten">
        {navItems('bottom')}
      </nav>
    </div>
  );
}

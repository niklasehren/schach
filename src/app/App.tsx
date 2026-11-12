import { GamesPage } from '../pages/GamesPage';
import { GameViewPage } from '../pages/GameViewPage';
import { ImportPage } from '../pages/ImportPage';
import { PlayPage } from '../pages/PlayPage';
import { useEffect } from 'react';
import { analysisQueue } from '../analysis/queue';
import { href, useRoute, type Route } from './router';

const links: { route: Route; label: string; match: Route['page'][] }[] = [
  { route: { page: 'spielen' }, label: 'Spielen', match: ['spielen'] },
  { route: { page: 'partien' }, label: 'Partien', match: ['partien', 'partie'] },
  { route: { page: 'import' }, label: 'Import', match: ['import'] },
];

export function App() {
  const route = useRoute();
  // Hintergrund-Analyse starten (läuft, solange die App offen ist)
  useEffect(() => {
    void analysisQueue.start();
  }, []);
  return (
    <div className="app">
      <header className="topbar">
        <a className="wordmark" href={href({ page: 'spielen' })}>
          Schach
        </a>
        <nav className="nav" aria-label="Hauptnavigation">
          {links.map((l) => {
            const active = l.match.includes(route.page);
            return (
              <a key={l.label} className={`nav-link ${active ? 'is-active' : ''}`} href={href(l.route)} aria-current={active ? 'page' : undefined}>
                {l.label}
              </a>
            );
          })}
          <a className="nav-link is-soon" aria-disabled="true">
            Training
          </a>
        </nav>
      </header>
      <main className="main">
        {/* Spielen und Import bleiben im Hintergrund erhalten: laufende Partie bzw. laufender Import gehen beim Seitenwechsel nicht verloren */}
        <div className="page-slot" hidden={route.page !== 'spielen'}>
          <PlayPage active={route.page === 'spielen'} />
        </div>
        <div className="page-slot" hidden={route.page !== 'import'}>
          <ImportPage />
        </div>
        {route.page === 'partien' && <GamesPage />}
        {route.page === 'partie' && <GameViewPage id={route.id} />}
      </main>
    </div>
  );
}

import { PlayPage } from '../pages/PlayPage';

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="wordmark">Schach</span>
        <nav className="nav" aria-label="Hauptnavigation">
          <a className="nav-link is-active" aria-current="page">Spielen</a>
          <a className="nav-link is-soon" aria-disabled="true">Partien</a>
          <a className="nav-link is-soon" aria-disabled="true">Training</a>
        </nav>
      </header>
      <main className="main">
        <PlayPage />
      </main>
    </div>
  );
}

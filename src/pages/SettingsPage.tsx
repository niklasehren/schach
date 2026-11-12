import { useState } from 'react';
import { BOARD_THEMES, getBoardTheme, getTheme, setBoardTheme, setTheme, type BoardTheme } from '../app/theme';

/** Einstellungen dieses Geräts: heller Modus, Brett-Theme */
export function SettingsPage() {
  const [light, setLight] = useState(getTheme() === 'light');
  const [board, setBoard] = useState<BoardTheme>(getBoardTheme());
  return (
    <div className="page">
      <h1 className="page-title">Einstellungen</h1>
      <section className="card settings-card">
        <h2 className="card-title">Darstellung</h2>
        <label className="switch-row">
          <span>
            <strong>Heller Modus</strong>
            <small>Standard ist dunkel. Gilt für dieses Gerät.</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={light}
            data-testid="light-mode"
            onChange={(e) => {
              setLight(e.target.checked);
              setTheme(e.target.checked ? 'light' : 'dark');
            }}
          />
        </label>
      </section>
      <section className="card settings-card">
        <h2 className="card-title">Brett</h2>
        <div className="board-themes" role="radiogroup" aria-label="Brett-Farben">
          {BOARD_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={board === t.id}
              className="board-theme"
              data-testid={`board-${t.id}`}
              onClick={() => {
                setBoard(t.id);
                setBoardTheme(t.id);
              }}
            >
              <span className="board-preview" aria-hidden style={{ ['--l' as string]: t.light, ['--d' as string]: t.dark }} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

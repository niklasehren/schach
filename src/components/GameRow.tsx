import type { AnalysisRecord, GameRecord } from '../db/schema';
import { formatDate, formatTimeControl, myResultText, scoreText } from '../chess/format';
import { href } from '../app/router';
import { Icon, type IconName } from './Icons';

const tcIcon: Record<string, IconName> = { bullet: 'bullet', blitz: 'blitz', rapid: 'rapid', daily: 'daily', classical: 'rapid' };
const tcName: Record<string, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', daily: 'Täglich', classical: 'Klassisch' };

export const timeClassName = (g: GameRecord) => (g.timeClass ? tcName[g.timeClass] : g.source === 'app' ? 'App-Partie' : 'ohne Uhr');

/** Eine Partie in Listen: Ergebnis-Abzeichen, Zeitklasse, Gegner mit Rating-Unterschied, Patzer, Analyse-Status */
export function GameRow({ game: g, analysis, analysing }: { game: GameRecord; analysis?: AnalysisRecord; analysing?: boolean }) {
  const opp = g.myColor ? (g.myColor === 'white' ? g.black : g.white) : null;
  const me = g.myColor ? g[g.myColor] : null;
  const name = opp ? (opp.isEngine && opp.detail ? `${opp.name} · ${opp.detail}` : opp.name) : `${g.white.name} – ${g.black.name}`;
  const diff = opp?.rating !== undefined && me?.rating !== undefined ? opp.rating - me.rating : null;
  const outcome = g.myResult ?? 'neutral';
  // Patzer: meine; ohne eigene Farbe (Gegen Freund, „Keiner“) beide Seiten zusammen
  const blunders =
    analysis?.status === 'done'
      ? g.myColor
        ? analysis.summary?.[g.myColor].blunders ?? 0
        : (analysis.summary?.white.blunders ?? 0) + (analysis.summary?.black.blunders ?? 0)
      : null;
  return (
    <a className="game-row" href={href({ page: 'partie', id: g.id })} data-testid="game-row">
      <span className={`res-badge res-${outcome}`}>{g.myResult ? myResultText[g.myResult] : scoreText(g.result)}</span>
      <span className="tc-icon" title={timeClassName(g)}>
        <Icon name={g.timeClass ? tcIcon[g.timeClass] : 'app'} size={18} />
      </span>
      <span className="game-main">
        <span className="game-opponent">
          {g.myColor && <span className={`color-swatch swatch-${g.myColor}`} aria-label={g.myColor === 'white' ? 'mit Weiß' : 'mit Schwarz'} />}
          <span className="game-opponent-name">{name}</span>
          {opp?.rating !== undefined && <span className="game-rating">{opp.rating}</span>}
          {diff !== null && (
            <span className={`rdiff ${diff > 0 ? 'is-up' : diff < 0 ? 'is-down' : ''}`} title={`Gegner ${Math.abs(diff)} Punkte ${diff >= 0 ? 'stärker' : 'schwächer'}`}>
              {diff > 0 ? '+' : diff < 0 ? '−' : '±'}
              {Math.abs(diff)}
            </span>
          )}
        </span>
        <span className="game-meta">
          {formatDate(g.date)} · {timeClassName(g)}
          {g.timeControl && <> {formatTimeControl(g.timeControl)}</>}
          {me?.rating !== undefined && <> · ich {me.rating}</>}
        </span>
      </span>
      <span className="game-side">
        {blunders !== null ? (
          <span className={`blunders ${blunders ? '' : 'is-zero'}`} data-testid="badge-done">
            <Icon name="check" size={13} />
            {blunders ? `${blunders} ${blunders === 1 ? 'Patzer' : 'Patzer'}` : 'analysiert'}
          </span>
        ) : analysis?.status === 'failed' ? (
          <span className="status-chip">nicht lesbar</span>
        ) : analysing ? (
          <span className="status-chip is-running">wird analysiert</span>
        ) : (
          <span className="status-chip">offen</span>
        )}
      </span>
    </a>
  );
}

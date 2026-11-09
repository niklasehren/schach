import type { Color } from '@lichess-org/chessground/types';
import type { GameSetup } from '../chess/session';
import { strengthHint, strengthLabel, strengthLevels } from '../engine/strength';

type Props = {
  setup: GameSetup;
  onChange: (setup: GameSetup) => void;
  onStart: () => void;
};

const colorChoices: { value: Color | 'random'; label: string }[] = [
  { value: 'white', label: 'Weiß' },
  { value: 'random', label: 'Zufall' },
  { value: 'black', label: 'Schwarz' },
];

/** Auswahl vor der Partie: Gegner, Farbe, Stärke bzw. Namen */
export function SetupPanel({ setup, onChange, onStart }: Props) {
  const set = (patch: Partial<GameSetup>) => onChange({ ...setup, ...patch });
  const strength = strengthLevels[setup.strengthIndex];

  return (
    <form
      className="setup"
      onSubmit={(e) => {
        e.preventDefault();
        onStart();
      }}
    >
      <h1 className="setup-title">Neue Partie</h1>

      <div className="segmented" role="radiogroup" aria-label="Gegner">
        <button type="button" role="radio" aria-checked={setup.mode === 'computer'} onClick={() => set({ mode: 'computer' })}>
          Gegen Computer
        </button>
        <button type="button" role="radio" aria-checked={setup.mode === 'friend'} onClick={() => set({ mode: 'friend' })}>
          Gegen Freund
        </button>
      </div>

      {setup.mode === 'computer' ? (
        <>
          <fieldset className="field">
            <legend className="field-label">Deine Farbe</legend>
            <div className="color-choices" role="radiogroup" aria-label="Deine Farbe">
              {colorChoices.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={setup.colorChoice === c.value}
                  className="color-choice"
                  onClick={() => set({ colorChoice: c.value })}
                >
                  <span className={`color-swatch swatch-${c.value}`} aria-hidden />
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <label className="field-label" htmlFor="strength">
              Spielstärke
            </label>
            <div className="strength-value">
              <span className="strength-label">{strengthLabel(strength)}</span>
              <span className="strength-hint">{strengthHint(strength)}</span>
            </div>
            <input
              id="strength"
              type="range"
              min={0}
              max={strengthLevels.length - 1}
              step={1}
              value={setup.strengthIndex}
              onChange={(e) => set({ strengthIndex: Number(e.target.value) })}
              aria-valuetext={strengthLabel(strength)}
            />
            <div className="range-ends" aria-hidden>
              <span>leichter</span>
              <span>stärker</span>
            </div>
          </div>
        </>
      ) : (
        <div className="field">
          <p className="field-note">Ihr spielt abwechselnd am selben Gerät.</p>
          <label className="input-row">
            <span className="color-swatch swatch-white" aria-hidden />
            <input
              type="text"
              placeholder="Name Weiß"
              aria-label="Name Weiß"
              value={setup.whiteName}
              maxLength={30}
              onChange={(e) => set({ whiteName: e.target.value })}
            />
          </label>
          <label className="input-row">
            <span className="color-swatch swatch-black" aria-hidden />
            <input
              type="text"
              placeholder="Name Schwarz"
              aria-label="Name Schwarz"
              value={setup.blackName}
              maxLength={30}
              onChange={(e) => set({ blackName: e.target.value })}
            />
          </label>
        </div>
      )}

      <button type="submit" className="btn btn-primary btn-large">
        Partie starten
      </button>
    </form>
  );
}

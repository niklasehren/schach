import type { Color } from '@lichess-org/chessground/types';
import type { GameSetup } from '../chess/session';
import { useEffect } from 'react';
import { recommendedStrengthIndex, strengthHint, strengthLabel, strengthLevels } from '../engine/strength';
import { db } from '../db/schema';
import { useLive } from '../db/useLive';
import { ColorSwatch } from './PlayerBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Choice, fieldLabel } from './Section';

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

/** Meine aktuelle Chess.com-Wertung: letzte Rapid-Partie, sonst letzte Chess.com-Partie überhaupt; null ohne Chess.com-Partien */
export async function myChessComRating(): Promise<number | null> {
  const games = await db.games.orderBy('date').reverse().filter((g) => g.source === 'chesscom' && !!g.myColor && g[g.myColor].rating !== undefined).toArray();
  const pick = games.find((g) => g.timeClass === 'rapid') ?? games[0];
  return pick ? pick[pick.myColor!].rating! : null;
}

/** Auswahl vor der Partie: Gegner, Farbe, Stärke bzw. Namen */
export function SetupPanel({ setup, onChange, onStart }: Props) {
  const set = (patch: Partial<GameSetup>) => onChange({ ...setup, ...patch });
  const strength = strengthLevels[setup.strengthIndex];
  const rating = useLive(() => myChessComRating(), []);
  const recommended = rating === undefined ? null : recommendedStrengthIndex(rating);
  // Solange ich die Stärke nicht selbst gewählt habe, gilt die Empfehlung
  useEffect(() => {
    if (recommended !== null && !setup.strengthChosen && setup.strengthIndex !== recommended) onChange({ ...setup, strengthIndex: recommended });
  }, [recommended, setup, onChange]);

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        onStart();
      }}
    >
      <h1 className="font-heading text-[52px] leading-none font-normal">Neue Partie</h1>

      <Choice
        label="Gegner"
        value={setup.mode}
        onChange={(mode) => set({ mode })}
        className="md:-ml-3"
        options={[
          { value: 'computer', label: 'Gegen Computer' },
          { value: 'friend', label: 'Gegen Freund' },
        ]}
      />

      {setup.mode === 'computer' ? (
        <>
          <div className="flex flex-col gap-2.5">
            <span className={fieldLabel} id="color-label">
              Deine Farbe
            </span>
            <Choice
              labelledBy="color-label"
              value={setup.colorChoice}
              onChange={(colorChoice) => set({ colorChoice })}
              className="md:-ml-3"
              options={colorChoices.map((c) => ({
                value: c.value,
                label: (
                  <>
                    <ColorSwatch color={c.value} className="size-[18px]" />
                    {c.label}
                  </>
                ),
              }))}
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="strength" className={fieldLabel}>
              Spielstärke
            </Label>
            <div className="flex flex-col">
              <span className="strength-label font-heading text-[40px] leading-tight font-normal">{strengthLabel(strength)}</span>
              <span className="text-[15px] text-muted-foreground">{strengthHint(strength)}</span>
            </div>
            <Slider
              id="strength"
              min={0}
              max={strengthLevels.length - 1}
              step={1}
              value={[setup.strengthIndex]}
              onValueChange={(v: number | readonly number[]) => set({ strengthIndex: typeof v === 'number' ? v : v[0], strengthChosen: true })}
              thumbLabel="Spielstärke"
              className="mt-1"
            />
            <div className="-mt-1 flex justify-between text-sm text-muted-foreground" aria-hidden>
              <span>leichter</span>
              <span>stärker</span>
            </div>
            <p className="text-[15px] leading-relaxed text-muted-foreground" data-testid="strength-note">
              Stockfish-Elo ist nicht mit {rating !== null ? 'deiner' : 'einer'} Chess.com-Wertung vergleichbar.
              {recommended !== null && (
                <>
                  {' '}
                  {rating !== null ? 'Empfohlen für dich' : 'Empfohlen zum Einstieg'}:{' '}
                  <button
                    type="button"
                    className="font-semibold text-brass-text underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    onClick={() => set({ strengthIndex: recommended, strengthChosen: true })}
                    data-testid="strength-recommended"
                  >
                    {strengthLabel(strengthLevels[recommended])}
                  </button>
                  {setup.strengthIndex === recommended ? ' (gewählt).' : '.'}
                </>
              )}
            </p>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground">Ihr spielt abwechselnd am selben Gerät.</p>
          <label className="flex items-center gap-2.5">
            <ColorSwatch color="white" />
            <Input
              className="h-11 text-base"
              type="text"
              placeholder="Name Weiß"
              aria-label="Name Weiß"
              value={setup.whiteName}
              maxLength={30}
              onChange={(e) => set({ whiteName: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2.5">
            <ColorSwatch color="black" />
            <Input
              className="h-11 text-base"
              type="text"
              placeholder="Name Schwarz"
              aria-label="Name Schwarz"
              value={setup.blackName}
              maxLength={30}
              onChange={(e) => set({ blackName: e.target.value })}
            />
          </label>
          <span className={`${fieldLabel} mt-2`} id="who-label">
            Wer bist du?
          </span>
          <Choice
            labelledBy="who-label"
            value={(setup.friendMe ?? 'none') as 'white' | 'black' | 'none'}
            onChange={(v) => set({ friendMe: v as GameSetup['friendMe'] })}
            className="md:-ml-3"
            itemClassName="max-w-40 truncate"
            options={(['white', 'black', 'none'] as const).map((v) => ({
              value: v,
              label: v === 'white' ? setup.whiteName.trim() || 'Weiß' : v === 'black' ? setup.blackName.trim() || 'Schwarz' : 'Keiner',
            }))}
          />
          <p className="text-sm text-muted-foreground">Fehler werden für dich markiert, und nur aus deinen Zügen entstehen Puzzles.</p>
        </div>
      )}

      <Button type="submit" size="lg" className="h-12 self-start px-6 text-base font-bold max-md:self-stretch">
        Partie starten
      </Button>
    </form>
  );
}

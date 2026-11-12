import type { Color } from '@lichess-org/chessground/types';
import type { GameSetup } from '../chess/session';
import { strengthHint, strengthLabel, strengthLevels } from '../engine/strength';
import { ColorSwatch } from './PlayerBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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

const fieldLabel = 'text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase';

/** Auswahl vor der Partie: Gegner, Farbe, Stärke bzw. Namen */
export function SetupPanel({ setup, onChange, onStart }: Props) {
  const set = (patch: Partial<GameSetup>) => onChange({ ...setup, ...patch });
  const strength = strengthLevels[setup.strengthIndex];

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        onStart();
      }}
    >
      <h1 className="font-heading text-4xl leading-tight">Neue Partie</h1>

      <ToggleGroup
        variant="outline"
        value={[setup.mode]}
        onValueChange={(v: string[]) => v[0] && set({ mode: v[0] as GameSetup['mode'] })}
        aria-label="Gegner"
        className="grid w-full grid-cols-2"
      >
        <ToggleGroupItem value="computer" className="h-10 text-[15px]">
          Gegen Computer
        </ToggleGroupItem>
        <ToggleGroupItem value="friend" className="h-10 text-[15px]">
          Gegen Freund
        </ToggleGroupItem>
      </ToggleGroup>

      {setup.mode === 'computer' ? (
        <>
          <div className="flex flex-col gap-2.5">
            <span className={fieldLabel} id="color-label">
              Deine Farbe
            </span>
            <ToggleGroup
              variant="outline"
              value={[setup.colorChoice]}
              onValueChange={(v: string[]) => v[0] && set({ colorChoice: v[0] as GameSetup['colorChoice'] })}
              aria-labelledby="color-label"
              className="grid w-full grid-cols-3"
            >
              {colorChoices.map((c) => (
                <ToggleGroupItem key={c.value} value={c.value} className="h-auto flex-col gap-2 py-3 text-[15px]">
                  <ColorSwatch color={c.value} className="size-7 rounded-md" />
                  {c.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="strength" className={fieldLabel}>
              Spielstärke
            </Label>
            <div className="flex flex-col">
              <span className="strength-label text-2xl font-bold">{strengthLabel(strength)}</span>
              <span className="text-sm text-muted-foreground">{strengthHint(strength)}</span>
            </div>
            <Slider
              id="strength"
              min={0}
              max={strengthLevels.length - 1}
              step={1}
              value={[setup.strengthIndex]}
              onValueChange={(v: number | readonly number[]) => set({ strengthIndex: typeof v === 'number' ? v : v[0] })}
              thumbLabel="Spielstärke"
              className="mt-1"
            />
            <div className="-mt-1 flex justify-between text-[13px] text-muted-foreground" aria-hidden>
              <span>leichter</span>
              <span>stärker</span>
            </div>
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
          <span className={`${fieldLabel} mt-1.5`} id="who-label">
            Wer bist du?
          </span>
          <ToggleGroup
            variant="outline"
            value={[setup.friendMe ?? 'none']}
            onValueChange={(v: string[]) => v[0] && set({ friendMe: v[0] as GameSetup['friendMe'] })}
            aria-labelledby="who-label"
            className="grid w-full grid-cols-3"
          >
            {(['white', 'black', 'none'] as const).map((v) => (
              <ToggleGroupItem key={v} value={v} className="h-10 truncate">
                {v === 'white' ? setup.whiteName.trim() || 'Weiß' : v === 'black' ? setup.blackName.trim() || 'Schwarz' : 'Keiner'}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-[13px] text-muted-foreground">Fehler werden für dich markiert, und nur aus deinen Zügen entstehen Puzzles.</p>
        </div>
      )}

      <Button type="submit" size="lg" className="h-12 text-base">
        Partie starten
      </Button>
    </form>
  );
}

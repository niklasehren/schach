import { useState } from 'react';
import { BOARD_THEMES, getBoardTheme, getTheme, setBoardTheme, setTheme, type BoardTheme } from '../app/theme';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Einstellungen dieses Geräts: heller Modus, Brett-Theme */
export function SettingsPage() {
  const [light, setLight] = useState(getTheme() === 'light');
  const [board, setBoard] = useState<BoardTheme>(getBoardTheme());
  return (
    <div className="flex w-full max-w-2xl animate-in flex-col gap-4 px-3.5 fade-in-0 slide-in-from-bottom-1 md:px-0">
      <h1 className="font-heading text-4xl">Einstellungen</h1>
      <Card>
        <CardHeader>
          <CardTitle>Darstellung</CardTitle>
          <CardDescription>Gilt für dieses Gerät.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <Label htmlFor="light-mode" className="flex flex-col items-start gap-0.5">
            <span className="text-[15px] font-semibold">Heller Modus</span>
            <span className="text-sm font-normal text-muted-foreground">Standard ist dunkel.</span>
          </Label>
          <Switch
            id="light-mode"
            checked={light}
            data-testid="light-mode"
            onCheckedChange={(on: boolean) => {
              setLight(on);
              setTheme(on ? 'light' : 'dark');
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Brett</CardTitle>
          <CardDescription>Farben der Felder.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Brett-Farben">
            {BOARD_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={board === t.id}
                data-testid={`board-${t.id}`}
                onClick={() => {
                  setBoard(t.id);
                  setBoardTheme(t.id);
                }}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border-[1.5px] bg-muted/40 p-3 text-sm font-semibold transition-colors hover:bg-muted',
                  board === t.id ? 'border-brass ring-1 ring-brass' : 'border-border',
                )}
              >
                <span
                  aria-hidden
                  className="aspect-square w-14 rounded-md sm:w-18"
                  style={{ background: `repeating-conic-gradient(${t.dark} 0 25%, ${t.light} 0 50%) 0 0 / 50% 50%` }}
                />
                {t.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

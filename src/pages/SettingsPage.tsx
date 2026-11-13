import { useState } from 'react';
import { BOARD_THEMES, getBoardTheme, getTheme, setBoardTheme, setTheme, type BoardTheme } from '../app/theme';
import { PageTitle, Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from '@/components/Section';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AccountCard, AdminCard, PrivacyCard } from '../components/AccountSettings';
import { InstallCard } from '../components/InstallHint';

/** Einstellungen dieses Geräts: heller Modus, Brett-Theme */
export function SettingsPage() {
  const [light, setLight] = useState(getTheme() === 'light');
  const [board, setBoard] = useState<BoardTheme>(getBoardTheme());
  return (
    <div className="flex w-full max-w-[760px] animate-in flex-col gap-10 px-4 fade-in-0 md:px-0">
      <PageTitle>Einstellungen</PageTitle>
      <div className="flex flex-col gap-12">
      <AccountCard />
      <AdminCard />
      <Section>
        <SectionHeader>
          <SectionTitle>Darstellung</SectionTitle>
          <SectionDescription>Gilt für dieses Gerät.</SectionDescription>
        </SectionHeader>
        <SectionContent className="flex-row items-center justify-between gap-4">
          <Label htmlFor="light-mode" className="flex flex-col items-start gap-0.5">
            <span className="text-[15px] font-semibold">Heller Modus</span>
            <span className="text-[15px] font-normal text-muted-foreground">Standard ist dunkel.</span>
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
        </SectionContent>
      </Section>
      <Section>
        <SectionHeader>
          <SectionTitle>Brett</SectionTitle>
          <SectionDescription>Farben der Felder.</SectionDescription>
        </SectionHeader>
        <SectionContent>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Brett-Farben">
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
                  'flex flex-col items-center gap-2 rounded-lg px-3 py-3 text-[15px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  board === t.id && 'bg-muted font-semibold text-foreground',
                )}
              >
                <span
                  aria-hidden
                  className="aspect-square w-16 rounded-md sm:w-20"
                  style={{ background: `repeating-conic-gradient(${t.dark} 0 25%, ${t.light} 0 50%) 0 0 / 50% 50%` }}
                />
                {t.label}
              </button>
            ))}
          </div>
        </SectionContent>
      </Section>
      <InstallCard />
      <PrivacyCard />
      </div>
    </div>
  );
}

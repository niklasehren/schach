import { useState } from 'react';
import { Share, SquarePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from '@/components/Section';
import { href } from '../app/router';
import { useAccount } from '../sync/state';

const DISMISS_KEY = 'schach.installHint.dismissed';

/** iPhone/iPad (auch iPadOS, das sich als Mac ausgibt) */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/** Läuft als installierte App vom Home-Bildschirm (nicht im Safari-Tab) */
export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
}

function Steps() {
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[15px]">
      <li className="flex items-start gap-2">
        <span className="font-semibold text-muted-foreground tabular-nums">1.</span>
        <span>
          In Safari unten (bzw. oben) auf <Share className="inline size-4 align-[-2px]" aria-label="Teilen" /> <strong>Teilen</strong> tippen.
        </span>
      </li>
      <li className="flex items-start gap-2">
        <span className="font-semibold text-muted-foreground tabular-nums">2.</span>
        <span>
          Nach unten scrollen und <SquarePlus className="inline size-4 align-[-2px]" aria-hidden /> <strong>„Zum Home-Bildschirm“</strong> wählen, dann <strong>„Hinzufügen“</strong>.
        </span>
      </li>
      <li className="flex items-start gap-2">
        <span className="font-semibold text-muted-foreground tabular-nums">3.</span>
        <span>
          Die App über das neue Symbol <strong>„Schach“</strong> öffnen – im Vollbild, auch ohne Internet.
        </span>
      </li>
    </ol>
  );
}

const STORAGE_NOTE =
  'Wichtig: Die App auf dem Home-Bildschirm hat einen eigenen Speicher, getrennt von Safari. Melde dich dort einmal mit deinem Konto an (Einstellungen → Konto) – dann kommen deine Partien und dein Training automatisch dazu.';

/** Kurzer Hinweis auf der Übersicht: nur in Safari am iPhone/iPad, ausblendbar */
export function InstallHintBanner() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const account = useAccount();
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* egal */
    }
  };
  if (hidden) return null;
  // In der installierten App: einmal anmelden, weil sie einen eigenen Speicher hat
  if (isStandalone()) {
    if (account.status !== 'signed-out') return null;
    return (
      <Section className="relative mb-8 gap-2 border-t-0 border-b pt-0 pb-6" data-testid="standalone-hint">
        <SectionHeader className="pr-12">
          <SectionTitle>Eigener Speicher in der App</SectionTitle>
        </SectionHeader>
        <SectionContent className="flex flex-col gap-2 text-[15px]">
          <p>{STORAGE_NOTE}</p>
          <a href={href({ page: 'einstellungen' })} className="font-semibold text-brass-text">
            Zur Anmeldung
          </a>
        </SectionContent>
        <Button variant="ghost" size="icon-sm" className="absolute top-0 right-0" aria-label="Hinweis ausblenden" onClick={dismiss}>
          <X />
        </Button>
      </Section>
    );
  }
  if (!isIos()) return null;
  return (
    <Section className="relative mb-8 gap-3 border-t-0 border-b pt-0 pb-6" data-testid="install-hint">
      <SectionHeader className="pr-12">
        <SectionTitle>Als App auf den Home-Bildschirm</SectionTitle>
        <SectionDescription>Dann startet Schach im Vollbild wie eine App und funktioniert auch offline.</SectionDescription>
      </SectionHeader>
      <SectionContent className="flex flex-col gap-3">
        <Steps />
        <p className="text-[15px] text-muted-foreground">{STORAGE_NOTE}</p>
      </SectionContent>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-0 right-0"
        aria-label="Hinweis ausblenden"
        onClick={dismiss}
      >
        <X />
      </Button>
    </Section>
  );
}

/** Immer in den Einstellungen: Anleitung bzw. Hinweis in der installierten App */
export function InstallCard() {
  const standalone = isStandalone();
  return (
    <Section data-testid="install-card">
      <SectionHeader>
        <SectionTitle>App aufs iPhone</SectionTitle>
        <SectionDescription>
          {standalone ? 'Du nutzt Schach als App vom Home-Bildschirm.' : 'Schach lässt sich wie eine App installieren – Vollbild, eigenes Symbol, offline nutzbar.'}
        </SectionDescription>
      </SectionHeader>
      <SectionContent className="flex flex-col gap-3">
        {!standalone && <Steps />}
        <p className="text-[15px] text-muted-foreground" data-testid="storage-note">
          {STORAGE_NOTE}
        </p>
        <p className="text-sm text-muted-foreground">Version {__APP_VERSION__}</p>
      </SectionContent>
    </Section>
  );
}

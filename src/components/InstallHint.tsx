import { useState } from 'react';
import { Share, SquarePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
        <span className="font-bold text-brass">1.</span>
        <span>
          In Safari unten (bzw. oben) auf <Share className="inline size-4 align-[-2px]" aria-label="Teilen" /> <strong>Teilen</strong> tippen.
        </span>
      </li>
      <li className="flex items-start gap-2">
        <span className="font-bold text-brass">2.</span>
        <span>
          Nach unten scrollen und <SquarePlus className="inline size-4 align-[-2px]" aria-hidden /> <strong>„Zum Home-Bildschirm“</strong> wählen, dann <strong>„Hinzufügen“</strong>.
        </span>
      </li>
      <li className="flex items-start gap-2">
        <span className="font-bold text-brass">3.</span>
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
      <Card className="relative gap-2 border-brass/50 md:col-span-2" data-testid="standalone-hint">
        <CardHeader className="pr-12">
          <CardTitle>Eigener Speicher in der App</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>{STORAGE_NOTE}</p>
          <a href={href({ page: 'einstellungen' })} className="font-semibold">
            Zur Anmeldung →
          </a>
        </CardContent>
        <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Hinweis ausblenden" onClick={dismiss}>
          <X />
        </Button>
      </Card>
    );
  }
  if (!isIos()) return null;
  return (
    <Card className="relative gap-3 border-brass/50 md:col-span-2" data-testid="install-hint">
      <CardHeader className="pr-12">
        <CardTitle>Als App auf den Home-Bildschirm</CardTitle>
        <CardDescription>Dann startet Schach im Vollbild wie eine App und funktioniert auch offline.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Steps />
        <p className="text-sm text-muted-foreground">{STORAGE_NOTE}</p>
      </CardContent>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-3 right-3"
        aria-label="Hinweis ausblenden"
        onClick={dismiss}
      >
        <X />
      </Button>
    </Card>
  );
}

/** Immer in den Einstellungen: Anleitung bzw. Hinweis in der installierten App */
export function InstallCard() {
  const standalone = isStandalone();
  return (
    <Card data-testid="install-card">
      <CardHeader>
        <CardTitle>App aufs iPhone</CardTitle>
        <CardDescription>
          {standalone ? 'Du nutzt Schach als App vom Home-Bildschirm.' : 'Schach lässt sich wie eine App installieren – Vollbild, eigenes Symbol, offline nutzbar.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!standalone && <Steps />}
        <p className="text-sm text-muted-foreground" data-testid="storage-note">
          {STORAGE_NOTE}
        </p>
        <p className="text-xs text-muted-foreground">Version {__APP_VERSION__}</p>
      </CardContent>
    </Card>
  );
}

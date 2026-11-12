import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';

const HOUR = 60 * 60 * 1000;

/**
 * Service Worker der PWA: macht die App offline nutzbar. Eine neue Version wird im Hintergrund geladen,
 * aktiviert wird sie erst nach Klick auf „Neu laden“ – nie automatisch mitten in einer Partie oder einem Puzzle.
 */
export function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Nach neuen Versionen sehen: stündlich und beim Zurückkehren in die App
      const check = () => {
        if (navigator.onLine && !registration.installing) void registration.update().catch(() => {});
      };
      window.setInterval(check, HOUR);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    },
  });

  // Eine später erkannte weitere Version soll wieder angezeigt werden
  useEffect(() => {
    if (needRefresh) setDismissed(false);
  }, [needRefresh]);

  if (!needRefresh || dismissed) return null;
  return (
    <div
      className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md animate-in items-center gap-3 rounded-xl border bg-card p-3 pl-4 shadow-xl fade-in-0 slide-in-from-bottom-2 md:bottom-6"
      role="status"
      data-testid="update-prompt"
    >
      <span className="grow text-sm font-semibold">Neue Version verfügbar</span>
      <Button size="sm" onClick={() => void updateServiceWorker(true)} data-testid="update-reload">
        <RefreshCw data-icon="inline-start" /> Neu laden
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Später" onClick={() => setDismissed(true)}>
        <X />
      </Button>
    </div>
  );
}

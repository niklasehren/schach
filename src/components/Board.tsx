import { useEffect, useLayoutEffect, useRef } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawBrushes } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';

type Props = {
  config: Config;
  onMove: (from: Key, to: Key) => void;
};

/**
 * Hülle um das Lichess-Brett (chessground). Das Brett selbst kennt keine Regeln;
 * es bekommt von außen Stellung und erlaubte Züge und meldet gezogene Züge zurück.
 */
export function Board({ config, onMove }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, {
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
      movable: { free: false, showDests: true, events: { after: (from, to) => onMoveRef.current(from, to) } },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      coordinates: true,
      // Pfeile für die Analyse: kräftig und gut sichtbar, auch am Handy
      drawable: {
        brushes: {
          bad: { key: 'xr', color: '#c62828', opacity: 0.85, lineWidth: 15 },
          good: { key: 'xg', color: '#15803d', opacity: 0.9, lineWidth: 15 },
          next: { key: 'xb', color: '#2563c9', opacity: 0.8, lineWidth: 13 },
          // chessground ergänzt diese Pinsel zu den eingebauten (green, red, …)
        } as unknown as DrawBrushes,
      },
    });
    // set() führt verschachtelte Einstellungen zusammen, statt sie zu ersetzen (wichtig für movable.events)
    // Erste Stellung ohne Animation setzen (sonst „fliegen“ die Figuren beim Öffnen einer Partie aus der Grundstellung)
    api.current.set({ animation: { enabled: false } });
    api.current.set(config);
    api.current.set({ animation: { enabled: true, duration: 180 } });
    // Das Brett merkt sich seine Bildschirmposition. Verschiebt sich das Layout (ohne Scrollen oder
    // Größenänderung), wäre sie veraltet – daher vor jeder Berührung neu messen lassen.
    const root = el.current;
    const remeasure = () => api.current?.state.dom.bounds.clear();
    root.addEventListener('mousedown', remeasure, { capture: true });
    root.addEventListener('touchstart', remeasure, { capture: true, passive: true });
    return () => {
      root.removeEventListener('mousedown', remeasure, { capture: true });
      root.removeEventListener('touchstart', remeasure, { capture: true });
      api.current?.destroy();
    };
    // Brett nur einmal erzeugen; Änderungen laufen über den zweiten Effekt
  }, []);

  // Vor dem Zeichnen anwenden, damit Brett und Zugliste nie auseinanderlaufen
  useLayoutEffect(() => {
    api.current?.set(config);
  }, [config]);

  // Pfeile zusätzlich als Attribut, damit Tests und Screenreader-Hilfen sie lesen können
  const arrows = (config.drawable?.autoShapes ?? []).map((sh) => `${sh.brush}:${sh.orig}${sh.dest ?? ''}`).join(',');
  return (
    <div className="board-frame">
      <div ref={el} className="board" data-testid="board" data-arrows={arrows || undefined} />
    </div>
  );
}

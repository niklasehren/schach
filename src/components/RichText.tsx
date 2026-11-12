import { useState } from 'react';
import { TERMS, type TermKey } from '../analysis/terms';

/**
 * Text mit Fachbegriffen im Format [[schlüssel|Anzeige]]. Begriffe sind fett und antippbar;
 * die Erklärung erscheint direkt darunter (funktioniert mit Maus, Tastatur und am Handy).
 */
export function RichText({ text }: { text: string }) {
  const [open, setOpen] = useState<TermKey | null>(null);
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[\[([^|\]]+)\|([^\]]+)\]\]$/);
        if (!m || !(m[1] in TERMS)) return <span key={i}>{part}</span>;
        const key = m[1] as TermKey;
        return (
          <button
            key={i}
            type="button"
            className={`term inline cursor-help border-0 bg-transparent p-0 font-bold underline decoration-dotted underline-offset-[3px] ${open === key ? 'text-brass' : ''}`}
            aria-expanded={open === key}
            onClick={() => setOpen(open === key ? null : key)}
            data-testid="term"
          >
            {m[2]}
          </button>
        );
      })}
      {open && (
        <span className="mt-1.5 block rounded-md bg-muted px-2.5 py-2 text-sm" role="note" data-testid="term-def">
          <strong>{TERMS[open].label}:</strong> {TERMS[open].text}
        </span>
      )}
    </>
  );
}

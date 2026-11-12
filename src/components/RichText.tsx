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
            className={`term ${open === key ? 'is-open' : ''}`}
            aria-expanded={open === key}
            onClick={() => setOpen(open === key ? null : key)}
            data-testid="term"
          >
            {m[2]}
          </button>
        );
      })}
      {open && (
        <span className="term-def" role="note" data-testid="term-def">
          <strong>{TERMS[open].label}:</strong> {TERMS[open].text}
        </span>
      )}
    </>
  );
}

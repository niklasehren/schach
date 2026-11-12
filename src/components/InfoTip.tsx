import { useState } from 'react';

/** Info-Symbol zum Antippen; die Erklärung klappt darunter auf (auch am Handy) */
export function InfoTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`info-btn ${open ? 'is-open' : ''}`} aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="info-btn">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      </button>
      {open && (
        <span className="info-text" role="note" data-testid="info-text">
          {text}
        </span>
      )}
    </>
  );
}

type Props = {
  ply: number;
  last: number;
  onGo: (ply: number) => void;
};

/** Vier Knöpfe zum Durchblättern: Anfang, zurück, vor, Ende */
export function NavControls({ ply, last, onGo }: Props) {
  const atEnd = ply >= last;
  return (
    <div className="nav-controls" aria-label="Züge durchblättern">
      <button className="icon-btn" aria-label="Zum Anfang" onClick={() => onGo(0)} disabled={ply === 0}>
        <Icon d="M7 6v12M18 6l-7 6 7 6" />
      </button>
      <button className="icon-btn" aria-label="Zug zurück" onClick={() => onGo(ply - 1)} disabled={ply === 0}>
        <Icon d="M15 6l-6 6 6 6" />
      </button>
      <button className="icon-btn" aria-label="Zug vor" onClick={() => onGo(ply + 1)} disabled={atEnd}>
        <Icon d="M9 6l6 6-6 6" />
      </button>
      <button className="icon-btn" aria-label="Zur aktuellen Stellung" onClick={() => onGo(last)} disabled={atEnd}>
        <Icon d="M17 6v12M6 6l7 6-7 6" />
      </button>
    </div>
  );
}

export function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/**
 * Anbindung an Stockfish. Die Engine läuft in einem Web Worker (Hintergrund-Prozess)
 * und wird über Textbefehle im UCI-Format gesteuert („position …“, „go …“ → „bestmove …“).
 */

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

export type EngineInfo = {
  name: string;
  /** Spanne der Elo-Begrenzung, so wie die Engine sie selbst meldet */
  eloMin: number;
  eloMax: number;
};

/** Verbindung zur Engine: im Browser ein Web Worker, in Tests Stockfish direkt in Node */
export type Transport = {
  send: (cmd: string) => void;
  onLine: (cb: (line: string) => void) => void;
  terminate: () => void;
};

export function workerTransport(url = ENGINE_URL): Transport {
  const worker = new Worker(url);
  return {
    send: (cmd) => worker.postMessage(cmd),
    onLine: (cb) => {
      worker.onmessage = (e: MessageEvent<string>) => cb(String(e.data));
    },
    terminate: () => worker.terminate(),
  };
}

/** Grenze für eine Analyse: feste Suchtiefe oder feste Zeit pro Stellung */
export type SearchLimit = { depth: number } | { movetime: number };

/** Bewertung aus Sicht von Weiß: cp = Hundertstel-Bauern, mate = Matt in n Zügen (positiv = Weiß setzt matt) */
export type Evaluation = { cp?: number; mate?: number; depth: number; best?: string; pv?: string[] };

export class Engine {
  private transport: Transport;
  private listeners = new Set<(line: string) => void>();
  private ready: Promise<EngineInfo>;
  /** Befehle laufen nacheinander, nie gleichzeitig */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(transport: Transport = workerTransport()) {
    this.transport = transport;
    transport.onLine((line) => {
      for (const listener of this.listeners) listener(line);
    });
    this.ready = this.handshake();
  }

  info(): Promise<EngineInfo> {
    return this.ready;
  }

  private send(cmd: string) {
    this.transport.send(cmd);
  }

  /** Schickt Befehle und wartet auf die erste Antwortzeile, für die `done` zutrifft. */
  private request(cmds: string[], done: (line: string) => boolean, onLine?: (line: string) => void): Promise<string> {
    return new Promise((resolve) => {
      const listener = (line: string) => {
        onLine?.(line);
        if (done(line)) {
          this.listeners.delete(listener);
          resolve(line);
        }
      };
      this.listeners.add(listener);
      for (const c of cmds) this.send(c);
    });
  }

  private async handshake(): Promise<EngineInfo> {
    const info: EngineInfo = { name: 'Stockfish', eloMin: 1320, eloMax: 3190 };
    await this.request(['uci'], (l) => l === 'uciok', (line) => {
      if (line.startsWith('id name ')) info.name = line.slice(8);
      const elo = line.match(/^option name UCI_Elo type spin default \d+ min (\d+) max (\d+)/);
      if (elo) {
        info.eloMin = Number(elo[1]);
        info.eloMax = Number(elo[2]);
      }
    });
    await this.request(['isready'], (l) => l === 'readyok');
    return info;
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    return next;
  }

  setOptions(options: Record<string, string | number | boolean>): Promise<void> {
    return this.enqueue(async () => {
      await this.ready;
      const cmds = Object.entries(options).map(([k, v]) => `setoption name ${k} value ${v}`);
      await this.request([...cmds, 'isready'], (l) => l === 'readyok');
    });
  }

  newGame(): Promise<void> {
    return this.enqueue(async () => {
      await this.ready;
      await this.request(['ucinewgame', 'isready'], (l) => l === 'readyok');
    });
  }

  /** Bester Zug für die Stellung (FEN), im UCI-Format z. B. „e2e4“ oder „e7e8q“. */
  bestMove(fen: string, movetimeMs: number): Promise<string> {
    return this.enqueue(async () => {
      await this.ready;
      const line = await this.request([`position fen ${fen}`, `go movetime ${movetimeMs}`], (l) => l.startsWith('bestmove'));
      return line.split(' ')[1];
    });
  }

  /**
   * Bewertet eine Stellung. Stockfish meldet die Bewertung aus Sicht der Seite am Zug;
   * hier wird sie auf die Sicht von Weiß umgerechnet.
   */
  evaluate(fen: string, limit: SearchLimit): Promise<Evaluation> {
    return this.enqueue(async () => {
      await this.ready;
      const whiteToMove = fen.split(' ')[1] !== 'b';
      let last: Evaluation | null = null;
      const go = 'depth' in limit ? `go depth ${limit.depth}` : `go movetime ${limit.movetime}`;
      const bestLine = await this.request([`position fen ${fen}`, go], (l) => l.startsWith('bestmove'), (line) => {
        const parsed = parseInfo(line);
        if (parsed) last = parsed;
      });
      const result: Evaluation = last ?? { depth: 0 };
      const sign = whiteToMove ? 1 : -1;
      const best = bestLine.split(' ')[1];
      return {
        depth: result.depth,
        cp: result.cp !== undefined ? sign * result.cp : undefined,
        mate: result.mate !== undefined ? sign * result.mate : undefined,
        best: best && best !== '(none)' ? best : result.pv?.[0],
        pv: result.pv,
      };
    });
  }

  terminate() {
    this.transport.terminate();
  }
}

/** Gemeinsame Engine für die ganze App: wird beim ersten Gebrauch gestartet. */
let shared: Engine | null = null;
export function getEngine(): Engine {
  shared ??= new Engine();
  return shared;
}

/** Liest eine „info depth … score … pv …“-Zeile (nur Hauptvariante, keine Zwischenstände mit Schranken) */
export function parseInfo(line: string): Evaluation | null {
  if (!line.startsWith('info ') || !line.includes(' score ') || !line.includes(' pv ')) return null;
  if (/ (lowerbound|upperbound)/.test(line)) return null;
  const multipv = line.match(/ multipv (\d+)/);
  if (multipv && multipv[1] !== '1') return null;
  const depth = Number(line.match(/ depth (\d+)/)?.[1] ?? 0);
  const score = line.match(/ score (cp|mate) (-?\d+)/);
  if (!score) return null;
  const pv = line.split(' pv ')[1].trim().split(/\s+/).slice(0, 12);
  return score[1] === 'cp' ? { depth, cp: Number(score[2]), pv } : { depth, mate: Number(score[2]), pv };
}

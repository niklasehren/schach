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

export class Engine {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  private ready: Promise<EngineInfo>;
  /** Befehle laufen nacheinander, nie gleichzeitig */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(url = ENGINE_URL) {
    this.worker = new Worker(url);
    this.worker.onmessage = (e: MessageEvent<string>) => {
      for (const listener of this.listeners) listener(String(e.data));
    };
    this.ready = this.handshake();
  }

  info(): Promise<EngineInfo> {
    return this.ready;
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
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

  terminate() {
    this.worker.terminate();
  }
}

/** Gemeinsame Engine für die ganze App: wird beim ersten Gebrauch gestartet. */
let shared: Engine | null = null;
export function getEngine(): Engine {
  shared ??= new Engine();
  return shared;
}

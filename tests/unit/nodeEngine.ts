import { createRequire } from 'node:module';
import { Engine, type Transport } from '../../src/engine/stockfish';

type Sf = { processCommand: (cmd: string) => void };
let sf: Sf | null = null;
let listener: (line: string) => void = () => {};

/**
 * Echte Stockfish-Engine (dieselbe Lite-Version wie im Browser), direkt in Node.
 * Das Paket lässt sich pro Prozess nur einmal laden; neue Engine-Objekte teilen sich die Instanz
 * (immer nur eines aktiv). counter.evaluations zählt die tatsächlich gerechneten Stellungen.
 */
export function nodeEngine(counter: { evaluations: number } = { evaluations: 0 }): Engine {
  if (!sf) {
    const require = createRequire(import.meta.url);
    sf = require('stockfish')('lite-single', (line: string) => listener(line)) as Sf;
  }
  const instance = sf;
  const transport: Transport = {
    send: (cmd) => {
      if (cmd.startsWith('go ')) counter.evaluations++;
      instance.processCommand(cmd);
    },
    onLine: (cb) => {
      listener = cb;
    },
    terminate: () => {},
  };
  return new Engine(transport);
}

import { liveQuery, type Subscription } from 'dexie';
import { Engine, type SearchLimit } from '../engine/stockfish';
import { db, type AnalysisRecord, type GameRecord } from '../db/schema';
import { getSetting, setSetting } from '../db/games';
import { analyseGame, DEFAULT_LIMIT } from './analyze';

export type QueueState = {
  /** running = rechnet, paused = vom Nutzer angehalten, yielding = wartet, weil gerade gegen den Computer gespielt wird */
  status: 'starting' | 'running' | 'paused' | 'yielding' | 'idle';
  processed: number;
  total: number;
  current: { gameId: string; date: number; position: number; positions: number } | null;
  /** Durchschnittliche Rechenzeit pro Partie (aus den fertigen Analysen) */
  avgMs: number | null;
};

const PAUSED_KEY = 'analysisPaused';

/**
 * Hintergrund-Analyse aller Partien: immer nur eine gleichzeitig, neueste zuerst.
 * Läuft nur, solange die App geöffnet ist; der Zwischenstand liegt in IndexedDB.
 */
export class AnalysisQueue {
  state: QueueState = { status: 'starting', processed: 0, total: 0, current: null, avgMs: null };
  private listeners = new Set<(s: QueueState) => void>();
  private paused = false;
  private yielding = false;
  private looping = false;
  private started = false;
  private priority: string | null = null;
  private engine: Engine | null = null;
  private sub: Subscription | null = null;

  constructor(
    private makeEngine: () => Engine = () => new Engine(),
    private limit: SearchLimit = DEFAULT_LIMIT,
  ) {}

  subscribe(fn: (s: QueueState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<QueueState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private statusNow(): QueueState['status'] {
    if (this.paused) return 'paused';
    if (this.yielding) return 'yielding';
    return this.looping ? 'running' : 'idle';
  }

  async start() {
    if (this.started) return;
    this.started = true;
    this.paused = (await getSetting<boolean>(PAUSED_KEY)) ?? false;
    // Entwickler-/Test-Einstellung: andere Suchtiefe, z. B. localStorage['schach.analysisLimit'] = '{"depth":8}'
    try {
      const custom = localStorage.getItem('schach.analysisLimit');
      if (custom) this.limit = JSON.parse(custom) as SearchLimit;
    } catch {
      // kein Browser-Speicher (Tests in Node, privates Fenster)
    }
    // Zähler aktuell halten; neue Partien wecken die Warteschlange
    this.sub = liveQuery(async () => {
      const [total, done] = await Promise.all([db.games.count(), db.analyses.where('status').anyOf('done', 'failed').toArray()]);
      const ok = done.filter((a) => a.status === 'done' && a.ms > 0);
      return { total, processed: done.length, avgMs: ok.length ? ok.reduce((s, a) => s + a.ms, 0) / ok.length : null };
    }).subscribe({
      next: (c) => {
        this.set({ ...c, status: this.statusNow() });
        this.wake();
      },
    });
  }

  stop() {
    this.sub?.unsubscribe();
    this.paused = true;
    this.engine?.terminate();
    this.engine = null;
  }

  async pause() {
    this.paused = true;
    this.set({ status: 'paused' });
    await setSetting(PAUSED_KEY, true);
  }

  async resume() {
    this.paused = false;
    await setSetting(PAUSED_KEY, false);
    this.set({ status: this.statusNow() });
    this.wake();
  }

  /** Während einer Partie gegen den Computer zurückstecken (beide Engines teilen sich die Rechenleistung) */
  setYielding(on: boolean) {
    if (this.yielding === on) return;
    this.yielding = on;
    this.set({ status: this.statusNow() });
    if (!on) this.wake();
  }

  /** Diese Partie als Nächstes analysieren */
  prioritize(gameId: string) {
    this.priority = gameId;
    this.wake();
  }

  private shouldStop = () => this.paused || this.yielding;

  private wake() {
    if (!this.started || this.looping || this.shouldStop()) return;
    void this.loop();
  }

  private async loop() {
    this.looping = true;
    this.set({ status: 'running' });
    try {
      while (!this.shouldStop()) {
        const game = await this.pickNext();
        if (!game) break;
        await this.analyse(game);
      }
    } finally {
      this.looping = false;
      this.set({ status: this.statusNow(), current: null });
    }
  }

  private async pickNext(): Promise<GameRecord | undefined> {
    const finished = new Set(await db.analyses.where('status').anyOf('done', 'failed').primaryKeys());
    if (this.priority) {
      const id = this.priority;
      this.priority = null;
      if (!finished.has(id)) {
        const g = await db.games.get(id);
        if (g) return g;
      }
    }
    // Neueste zuerst; eine angefangene Partie zuerst fertig rechnen
    const partial = await db.analyses.where('status').equals('partial').primaryKeys();
    for (const id of partial) {
      const g = await db.games.get(id);
      if (g) return g;
    }
    let next: GameRecord | undefined;
    await db.games
      .orderBy('date')
      .reverse()
      .until(() => next !== undefined)
      .each((g) => {
        if (!next && !finished.has(g.id)) next = g;
      });
    return next;
  }

  private async analyse(game: GameRecord) {
    this.engine ??= this.makeEngine();
    const engineName = (await this.engine.info()).name;
    const existing = await db.analyses.get(game.id);
    // Zwischenstand nur übernehmen, wenn er mit derselben Einstellung gerechnet wurde
    const resume = existing?.status === 'partial' && JSON.stringify(existing.limit) === JSON.stringify(this.limit) ? existing : undefined;
    const startedAt = performance.now();
    this.set({ current: { gameId: game.id, date: game.date, position: 0, positions: game.plies + 1 } });
    try {
      const record = await analyseGame(game, this.engine, this.limit, {
        engineName,
        resume: resume?.evals,
        previousMs: resume?.ms ?? 0,
        shouldStop: this.shouldStop,
        onProgress: (p) => this.set({ current: { gameId: game.id, date: game.date, ...p } }),
        onSave: async (evals) => {
          const now = Date.now();
          const partial: AnalysisRecord = {
            gameId: game.id,
            createdAt: resume?.createdAt ?? now,
            updatedAt: now,
            status: 'partial',
            engine: engineName,
            limit: this.limit,
            evals,
            myColor: game.myColor,
            timeClass: game.timeClass ?? null,
            baseTime: null,
            ms: Math.round((resume?.ms ?? 0) + performance.now() - startedAt),
          };
          await db.analyses.put(partial);
        },
      });
      if (record) await db.analyses.put(record);
    } catch (e) {
      console.warn('Analyse fehlgeschlagen', game.id, e);
      const now = Date.now();
      await db.analyses.put({
        gameId: game.id,
        createdAt: now,
        updatedAt: now,
        status: 'failed',
        engine: engineName,
        limit: this.limit,
        evals: [],
        myColor: game.myColor,
        timeClass: game.timeClass ?? null,
        baseTime: null,
        ms: 0,
      });
    }
  }
}

/** Die eine Warteschlange der App */
export const analysisQueue = new AnalysisQueue();

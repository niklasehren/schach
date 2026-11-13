import { useMemo, useState } from "react";
import { db, type GameRecord } from "../db/schema";
import { useLive } from "../db/useLive";
import { href } from "../app/router";
import { AnalysisPanel } from "../components/AnalysisPanel";
import { GameRow } from "../components/GameRow";
import { useQueueState } from "../analysis/useQueue";
import { Button } from "@/components/ui/button";
import { ChevronDown, NotebookPen } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PAGE = 50;

type SourceF = "all" | GameRecord["source"];
type TimeF = "all" | "bullet" | "blitz" | "rapid" | "daily";
type ResultF = "all" | "win" | "loss" | "draw";

/** Kompaktes Auswahlmenü mit Beschriftung, z. B. „Zeit: alle“ (am iPhone öffnet sich die Systemauswahl) */
function FilterSelect<T extends string>({ label, name, value, options, onChange }: { label: string; name: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className="relative inline-flex h-10 items-center gap-1.5 rounded-lg border bg-background pr-8 pl-3 text-[15px] focus-within:ring-2 focus-within:ring-ring">
      <span className="text-muted-foreground">{label}:</span>
      <select
        aria-label={name}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
      <span className="font-semibold" aria-hidden>
        {options.find(([v]) => v === value)?.[1]}
      </span>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-muted-foreground" aria-hidden />
    </label>
  );
}

export function GamesPage() {
  const [source, setSource] = useState<SourceF>("all");
  const [time, setTime] = useState<TimeF>("all");
  const [result, setResult] = useState<ResultF>("all");
  const [limit, setLimit] = useState(PAGE);
  const all = useLive(() => db.games.orderBy("date").reverse().toArray(), []);
  const filtered = useMemo(
    () =>
      (all ?? []).filter(
        (g) =>
          (source === "all" || g.source === source) &&
          (time === "all" || g.timeClass === time) &&
          (result === "all" || g.myResult === result),
      ),
    [all, source, time, result],
  );
  const shown = filtered.slice(0, limit);
  const ids = shown.map((g) => g.id);
  const analyses = useLive(
    () =>
      db.analyses
        .where("gameId")
        .anyOf(ids)
        .toArray()
        .then((rows) => new Map(rows.map((a) => [a.gameId, a]))),
    [ids.join(",")],
  );
  const queue = useQueueState();
  const reset = () => setLimit(PAGE);

  return (
    <div className="flex w-full max-w-[920px] animate-in flex-col gap-6 px-4 fade-in-0 md:px-0">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-[52px] leading-none font-normal md:text-[64px]">Partien</h1>
          {all && (
            <span className="text-[15px] text-muted-foreground tabular-nums" data-testid="games-count">
              {filtered.length === all.length ? `${all.length} insgesamt` : `${filtered.length} von ${all.length}`}
            </span>
          )}
        </div>
        <a className="inline-flex items-center gap-1.5 pb-1 text-[15px] text-muted-foreground no-underline hover:text-foreground" href={href({ page: "brett" })}>
          <NotebookPen className="size-4" /> Brettpartie eintragen
        </a>
      </header>

      <AnalysisPanel />

      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <Tabs
          value={source}
          onValueChange={(v) => {
            setSource(v as SourceF);
            reset();
          }}
        >
          <TabsList variant="line" aria-label="Quelle" className="h-10 gap-1">
            {(
              [
                ["all", "Alle"],
                ["chesscom", "Chess.com"],
                ["brett", "Brett"],
                ["app", "App"],
              ] as [SourceF, string][]
            ).map(([v, text]) => (
              <TabsTrigger key={v} value={v} className="px-2.5 text-[15px]">
                {text}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <FilterSelect
            label="Zeit"
            name="Zeitklasse"
            value={time}
            onChange={(v) => {
              setTime(v);
              reset();
            }}
            options={[
              ["all", "alle"],
              ["bullet", "Bullet"],
              ["blitz", "Blitz"],
              ["rapid", "Rapid"],
              ["daily", "Täglich"],
            ]}
          />
          <FilterSelect
            label="Ergebnis"
            name="Ergebnis"
            value={result}
            onChange={(v) => {
              setResult(v);
              reset();
            }}
            options={[
              ["all", "alle"],
              ["win", "Siege"],
              ["loss", "Niederlagen"],
              ["draw", "Remis"],
            ]}
          />
        </div>
      </div>

      {all && filtered.length === 0 && (
        <div className="border-t pt-6 text-muted-foreground">
          <p>
            {all.length === 0
              ? "Noch keine Partien."
              : "Keine Partien für diese Filter."}
          </p>
          {all.length === 0 && (
            <p className="mt-1">
              Spiel eine Partie unter{" "}
              <a href={href({ page: "spielen" })}>Spielen</a> oder hol dir deine
              Partien über <a href={href({ page: "import" })}>Import</a> von
              Chess.com.
            </p>
          )}
        </div>
      )}

      {shown.length > 0 && (
        <div className="-mt-2 flex flex-col" data-testid="game-list">
          {shown.map((g) => (
            <GameRow
              key={g.id}
              game={g}
              analysis={analyses?.get(g.id)}
              analysing={queue.current?.gameId === g.id}
            />
          ))}
        </div>
      )}

      {filtered.length > shown.length && (
        <Button
          variant="ghost"
          className="self-start text-[15px] text-brass-text"
          onClick={() => setLimit((l) => l + PAGE)}
        >
          Weitere anzeigen ({filtered.length - shown.length})
        </Button>
      )}
    </div>
  );
}

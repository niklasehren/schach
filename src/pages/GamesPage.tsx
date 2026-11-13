import { useMemo, useState } from "react";
import { db, type GameRecord } from "../db/schema";
import { useLive } from "../db/useLive";
import { href } from "../app/router";
import { AnalysisPanel } from "../components/AnalysisPanel";
import { GameRow } from "../components/GameRow";
import { useQueueState } from "../analysis/useQueue";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { NotebookPen } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const PAGE = 50;

type SourceF = "all" | GameRecord["source"];
type TimeF = "all" | "bullet" | "blitz" | "rapid" | "daily";
type ResultF = "all" | "win" | "loss" | "draw";

/** Filter als ToggleGroup (eine Auswahl) */
function Filter<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      value={[value]}
      onValueChange={(v: string[]) => v[0] && onChange(v[0] as T)}
      aria-label={label}
      className={cn("grid w-full sm:flex sm:w-auto sm:flex-wrap", className)}
    >
      {options.map(([v, text]) => (
        <ToggleGroupItem
          key={v}
          value={v}
          aria-label={text}
          className="px-1 sm:px-3"
        >
          {text.startsWith("Alle ") ? "Alle" : text}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
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
    <div className="flex w-full max-w-[980px] animate-in flex-col gap-4 px-3.5 fade-in-0 slide-in-from-bottom-1 md:px-0">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-heading text-4xl">Partien</h1>
        {all && (
          <span className="text-muted-foreground">
            {filtered.length === 1 ? "1 Partie" : `${filtered.length} Partien`}
          </span>
        )}
      </div>

      <a
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 self-start text-[15px] text-foreground no-underline")}
        href={href({ page: "brett" })}
      >
        <NotebookPen data-icon="inline-start" /> Brettpartie eintragen
      </a>

      <AnalysisPanel />

      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-x-4">
        <Filter
          label="Quelle"
          value={source}
          className="grid-cols-4"
          onChange={(v) => {
            setSource(v);
            reset();
          }}
          options={[
            ["all", "Alle"],
            ["app", "App"],
            ["chesscom", "Chess.com"],
            ["brett", "Brett"],
          ]}
        />
        <Filter
          label="Zeitklasse"
          value={time}
          className="grid-cols-5"
          onChange={(v) => {
            setTime(v);
            reset();
          }}
          options={[
            ["all", "Alle Zeiten"],
            ["bullet", "Bullet"],
            ["blitz", "Blitz"],
            ["rapid", "Rapid"],
            ["daily", "Täglich"],
          ]}
        />
        <Filter
          label="Ergebnis"
          value={result}
          className="grid-cols-4"
          onChange={(v) => {
            setResult(v);
            reset();
          }}
          options={[
            ["all", "Alle Ergebnisse"],
            ["win", "Siege"],
            ["loss", "Niederlagen"],
            ["draw", "Remis"],
          ]}
        />
      </div>

      {all && filtered.length === 0 && (
        <div className="rounded-xl border-[1.5px] border-dashed p-5 text-muted-foreground">
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
        <Card className="gap-0 py-0" data-testid="game-list">
          {shown.map((g) => (
            <GameRow
              key={g.id}
              game={g}
              analysis={analyses?.get(g.id)}
              analysing={queue.current?.gameId === g.id}
            />
          ))}
        </Card>
      )}

      {filtered.length > shown.length && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setLimit((l) => l + PAGE)}
        >
          Weitere anzeigen ({filtered.length - shown.length})
        </Button>
      )}
    </div>
  );
}

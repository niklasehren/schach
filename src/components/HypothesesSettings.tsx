import { useState, type ReactNode } from 'react';
import type { Phase, Side } from '../db/schema';
import { PHASE_LABELS } from '../db/boardGames';
import { defaultText, IN_PHASE, KIND_LABELS, SUGGESTIONS, type Hypothesis, type HypothesisKind } from '../stats/hypotheses';
import { allFamilies, openingLabel } from '../stats/openings';
import { saveHypotheses, useHypotheses } from '../pages/stats/useStats';
import { Choice, Section, SectionContent, SectionDescription, SectionHeader, SectionTitle, fieldLabel } from '@/components/Section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { href } from '../app/router';

/** Vorlage für eine neue Vermutung je Art */
function blank(kind: HypothesisKind): Hypothesis {
  const id = `h${Date.now().toString(36)}`;
  const h: Hypothesis =
    kind === 'color'
      ? { id, kind, text: '', better: 'white' }
      : kind === 'phase'
        ? { id, kind, text: '', phase: 'endgame', earlyOversight: false }
        : kind === 'timeTrouble'
          ? { id, kind, text: '' }
          : kind === 'opening'
            ? { id, kind, text: '', family: 'French Defense', color: 'black', claim: 'good', materialLoss: false }
            : { id, kind, text: '', days: 14 };
  return { ...h, text: defaultText(h) };
}

/** Kurze Beschreibung, was die App prüft */
function checks(h: Hypothesis): string {
  switch (h.kind) {
    case 'color':
      return `Prüft Punkte-Quote und Patzer pro Partie, ${h.better === 'white' ? 'Weiß' : 'Schwarz'} gegen die andere Farbe.`;
    case 'phase':
      return `Prüft, ob der entscheidende Fehler in Niederlagen meist ${IN_PHASE[h.phase]} liegt${h.earlyOversight ? ', und ob er davor meist durch Übersehen passiert' : ''}.`;
    case 'timeTrouble':
      return 'Prüft die Fehlerquote pro Zug unter 10 % Restzeit gegenüber sonst (nur Partien mit Uhr).';
    case 'opening':
      return `Prüft ${openingLabel(h.family)} mit ${h.color === 'white' ? 'Weiß' : 'Schwarz'} gegen deine anderen Partien mit dieser Farbe${h.claim !== 'none' ? ': Punkte-Quote' : ''}${h.materialLoss ? `${h.claim !== 'none' ? ' und' : ':'} Materialverlust` : ''}.`;
    case 'progress':
      return `Prüft Patzer pro Partie und Genauigkeit der letzten ${Math.round(h.days / 7)} Wochen gegenüber davor.`;
  }
}

/** Einstellungen: meine Vermutungen bearbeiten, eigene hinzufügen, Vorschläge übernehmen */
export function HypothesesCard() {
  const list = useHypotheses();
  const [editing, setEditing] = useState<Hypothesis | null>(null);
  if (!list) return null;
  const save = (next: Hypothesis[]) => void saveHypotheses(next);
  const open = SUGGESTIONS.filter((s) => !list.some((h) => h.id === s.id));
  const isNew = editing ? !list.some((h) => h.id === editing.id) : false;

  return (
    <Section aria-labelledby="hyp-settings" data-testid="hypotheses-settings">
      <SectionHeader>
        <SectionTitle id="hyp-settings">Deine Vermutungen</SectionTitle>
        <SectionDescription>
          Was du über dein Spiel glaubst. Die{' '}
          <a className="underline underline-offset-4 hover:text-foreground" href={href({ page: 'statistik' })}>
            Statistik
          </a>{' '}
          vergleicht jede Vermutung mit deinen Partien.
        </SectionDescription>
      </SectionHeader>
      <SectionContent>
        {list.length === 0 && !editing && <p className="text-[15px] text-muted-foreground">Noch keine Vermutungen. Übernimm einen Vorschlag oder lege eine eigene an.</p>}
        <ul className="flex list-none flex-col p-0">
          {list.map((h) =>
            editing?.id === h.id ? (
              <li key={h.id} className="border-t py-4 first:border-t-0 first:pt-0">
                <Editor value={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={() => (save(list.map((x) => (x.id === h.id ? editing : x))), setEditing(null))} />
              </li>
            ) : (
              <li key={h.id} className="flex flex-col gap-1 border-t py-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-start sm:gap-4" data-testid="hypothesis-item">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-heading text-[22px] leading-snug">„{h.text}“</span>
                  <span className="text-[15px] text-muted-foreground">
                    {KIND_LABELS[h.kind]}. {checks(h)}
                  </span>
                </div>
                <span className="flex gap-1 sm:pt-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(h)} aria-label={`„${h.text}“ bearbeiten`}>
                    Bearbeiten
                  </Button>
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => save(list.filter((x) => x.id !== h.id))} aria-label={`„${h.text}“ löschen`}>
                    Löschen
                  </Button>
                </span>
              </li>
            ),
          )}
        </ul>
        {editing && isNew && (
          <div className="border-t pt-4">
            <Editor value={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={() => (save([...list, editing]), setEditing(null))} />
          </div>
        )}
        {!editing && (
          <div className="flex flex-col gap-2">
            <span className={fieldLabel}>Eigene Vermutung hinzufügen</span>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Art der neuen Vermutung">
              {(Object.keys(KIND_LABELS) as HypothesisKind[]).map((k) => (
                <Button key={k} variant="outline" size="sm" onClick={() => setEditing(blank(k))} data-testid={`add-${k}`}>
                  {KIND_LABELS[k]}
                </Button>
              ))}
            </div>
          </div>
        )}
        {!editing && open.length > 0 && (
          <div className="flex flex-col gap-2" data-testid="suggestions">
            <span className={fieldLabel}>Vorschläge</span>
            <ul className="flex list-none flex-col gap-1 p-0">
              {open.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <span className="text-[15px]">„{s.text}“</span>
                  <Button variant="ghost" size="sm" className="shrink-0 font-semibold text-brass-text" onClick={() => save([...list, s])}>
                    Übernehmen
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionContent>
    </Section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={fieldLabel}>{label}</span>
      {children}
    </div>
  );
}

function Editor({ value: h, onChange, onSave, onCancel }: { value: Hypothesis; onChange: (h: Hypothesis) => void; onSave: () => void; onCancel: () => void }) {
  // Ändern sich die Einstellungen und der Text war noch der Vorschlag, wandert der Text mit
  const set = (patch: Partial<Hypothesis>) => {
    const next = { ...h, ...patch } as Hypothesis;
    onChange(h.text === defaultText(h) ? { ...next, text: defaultText(next) } : next);
  };
  return (
    <div className="flex flex-col gap-4" data-testid="hypothesis-editor">
      <p className="text-[15px] text-muted-foreground">
        {KIND_LABELS[h.kind]}. {checks(h)}
      </p>
      {h.kind === 'color' && (
        <Field label="Besser mit">
          <Choice<Side>
            label="Besser mit"
            value={h.better}
            onChange={(v) => set({ better: v })}
            options={[
              { value: 'white', label: 'Weiß' },
              { value: 'black', label: 'Schwarz' },
            ]}
          />
        </Field>
      )}
      {h.kind === 'phase' && (
        <>
          <Field label="Ich verliere eher in der Phase">
            <Choice<Phase> label="Phase" value={h.phase} onChange={(v) => set({ phase: v })} options={(['opening', 'middlegame', 'endgame'] as Phase[]).map((p) => ({ value: p, label: PHASE_LABELS[p] }))} />
          </Field>
          {h.phase !== 'opening' && (
            <Label className="flex items-center gap-3 text-[15px] font-normal">
              <Switch checked={h.earlyOversight} onCheckedChange={(on: boolean) => set({ earlyOversight: on })} />
              Davor meist durch Übersehen
            </Label>
          )}
        </>
      )}
      {h.kind === 'opening' && (
        <>
          <Field label="Eröffnung">
            <select
              aria-label="Eröffnung"
              value={h.family}
              onChange={(e) => set({ family: e.target.value })}
              className="h-10 max-w-sm rounded-md border bg-background px-2 text-[15px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {allFamilies().map((f) => (
                <option key={f} value={f}>
                  {openingLabel(f)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mit">
            <Choice<Side>
              label="Farbe"
              value={h.color}
              onChange={(v) => set({ color: v })}
              options={[
                { value: 'white', label: 'Weiß' },
                { value: 'black', label: 'Schwarz' },
              ]}
            />
          </Field>
          <Field label="Liegt mir">
            <Choice<'good' | 'bad' | 'none'>
              label="Liegt mir"
              value={h.claim}
              onChange={(v) => set({ claim: v })}
              options={[
                { value: 'good', label: 'Ja' },
                { value: 'bad', label: 'Nein' },
                { value: 'none', label: 'Keine Aussage' },
              ]}
            />
          </Field>
          <Label className="flex items-center gap-3 text-[15px] font-normal">
            <Switch checked={h.materialLoss} onCheckedChange={(on: boolean) => set({ materialLoss: on })} />
            Ich verliere dort oft Material
          </Label>
        </>
      )}
      {h.kind === 'progress' && (
        <Field label="Seit">
          <Choice<string>
            label="Seit"
            value={String(h.days)}
            onChange={(v) => set({ days: Number(v) })}
            options={[7, 14, 21, 28].map((d) => ({ value: String(d), label: d === 7 ? '1 Woche' : `${d / 7} Wochen` }))}
          />
        </Field>
      )}
      <Field label="In deinen Worten">
        <Input value={h.text} onChange={(e) => onChange({ ...h, text: e.target.value })} aria-label="Vermutung in deinen Worten" className="h-10 text-[15px]" data-testid="hypothesis-text" />
      </Field>
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={!h.text.trim()} data-testid="hypothesis-save">
          Speichern
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

import { describe, expect, it } from 'vitest';
import { countErrorTypes, errorTypeOf, ERROR_TYPE_LABELS } from '../../src/analysis/errorTypes';
import type { AnalysisRecord } from '../../src/db/schema';

describe('Fehlerarten', () => {
  it('erste passende Regel aus „Warum … schlecht ist“, sonst Stellungsfehler', () => {
    expect(errorTypeOf(['threatMissed', 'undefendedTaken'])).toBe('threatMissed');
    expect(errorTypeOf(['undefendedTaken'])).toBe('undefended');
    expect(errorTypeOf(['hanging'])).toBe('undefended');
    expect(errorTypeOf(['checkUseless'])).toBe('forcingUseless');
    expect(errorTypeOf([])).toBe('other');
    expect(ERROR_TYPE_LABELS.other).toContain('Stellungsfehler');
  });

  it('zählt nur meine Fehler, häufigste zuerst', () => {
    const a = (types: (string | undefined)[], myColor: 'white' | 'black' = 'white') =>
      ({ myColor, sides: { white: types.map((t) => ({ errorType: t })), black: [{ errorType: 'mateAllowed' }] } }) as unknown as AnalysisRecord;
    const c = countErrorTypes([a(['undefended', 'threatMissed', 'undefended', undefined]), a(['undefended'])]);
    expect(c[0]).toEqual({ type: 'undefended', label: 'Figur oder Bauer ungedeckt gelassen', count: 3 });
    expect(c.map((x) => x.type)).toEqual(['undefended', 'threatMissed']);
  });
});

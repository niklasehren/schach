import { describe, expect, it } from 'vitest';
import { formatClock, formatTimeControl, parseClock } from '../../src/chess/format';

describe('Anzeige', () => {
  it('Bedenkzeit', () => {
    expect(formatTimeControl('600')).toBe('10 min');
    expect(formatTimeControl('180+2')).toBe('3+2');
    expect(formatTimeControl('60+1')).toBe('1+1');
    expect(formatTimeControl('30')).toBe('30 s');
    expect(formatTimeControl('1/86400')).toBe('1 Tag');
    expect(formatTimeControl('1/259200')).toBe('3 Tage');
    expect(formatTimeControl(null)).toBe('–');
  });

  it('Restzeit', () => {
    expect(parseClock('[%clk 0:09:58.9]')).toBeCloseTo(598.9);
    expect(parseClock('[%clk 1:00:00]')).toBe(3600);
    expect(parseClock('kein Kommentar')).toBeNull();
    expect(formatClock(598.9)).toBe('9:58');
    expect(formatClock(3723)).toBe('1:02:03');
    expect(formatClock(8.45)).toBe('0:08,4');
  });
});

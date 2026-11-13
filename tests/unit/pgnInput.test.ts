import { describe, expect, it } from 'vitest';
import { MoveInputError, normalizePgn, parseMoveInput, toEnglishSan } from '../../src/chess/pgnInput';

const sans = (text: string) => parseMoveInput(text)!.history();
const errorOf = (text: string) => {
  try {
    parseMoveInput(text);
  } catch (e) {
    expect(e).toBeInstanceOf(MoveInputError);
    return (e as Error).message;
  }
  throw new Error('kein Fehler');
};

describe('Einzelne Züge in englische Schreibweise', () => {
  it.each([
    ['Sf3', 'Nf3'],
    ['Lxc6+', 'Bxc6+'],
    ['Dxf7#', 'Qxf7#'],
    ['Tae1', 'Rae1'],
    ['S1d2', 'N1d2'],
    ['Kg1', 'Kg1'],
    ['Sxe5!?', 'Nxe5!?'],
    ['Lb5', 'Bb5'],
    ['S:e5', 'Nxe5'],
    ['e8=D', 'e8=Q'],
    ['e8D', 'e8=Q'],
    ['dxe8=S+', 'dxe8=N+'],
    ['a1=T', 'a1=R'],
    ['b8=L', 'b8=B'],
    ['12.Sf3', '12.Nf3'],
    ['5...Lxc6+', '5...Bxc6+'],
  ])('%s → %s', (de, en) => expect(toEnglishSan(de)).toBe(en));

  it.each(['e4', 'exd5', 'b4', 'bxc3', 'Nf3', 'Bxc6+', 'Qh5', 'Rxe1', 'e8=Q', '1-0', '0-1', '1/2-1/2', '*', '$1', '12.'])('%s bleibt unverändert', (t) =>
    expect(toEnglishSan(t)).toBe(t),
  );

  it.each([
    ['0-0', 'O-O'],
    ['0-0-0', 'O-O-O'],
    ['O-O', 'O-O'],
    ['O-O-O+', 'O-O-O+'],
    ['0-0#', 'O-O#'],
  ])('Rochade %s → %s', (a, b) => expect(toEnglishSan(a)).toBe(b));

  it('Kopfzeilen und Kommentare (z. B. Uhrzeiten) bleiben unverändert', () => {
    const pgn = '[White "Dieter Schmidt"]\n[Black "Tom"]\n\n1. e4 {[%clk 0:10:00] Dame Läufer Sf3} e5 2. Sf3 ; Springer S\n2... Sc6 1-0';
    expect(normalizePgn(pgn)).toBe('[White "Dieter Schmidt"]\n[Black "Tom"]\n\n1. e4 {[%clk 0:10:00] Dame Läufer Sf3} e5 2. Nf3 ; Springer S\n2... Nc6 1-0');
  });
});

describe('Züge einlesen', () => {
  it('deutsche Schreibweise', () => {
    expect(sans('1. e4 e5 2. Lc4 Sc6 3. Dh5 Sf6 4. Dxf7#')).toEqual(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']);
  });

  it('englische Schreibweise unverändert', () => {
    expect(sans('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0')).toHaveLength(7);
  });

  it('gemischt, auch ohne Leerzeichen nach der Zugnummer', () => {
    expect(sans('1.e4 e5 2.Nf3 Sc6 3.Lb5 a6 4.Bxc6 dxc6 5.0-0 Lg4 6.h3 Bh5')).toEqual([
      'e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O', 'Bg4', 'h3', 'Bh5',
    ]);
  });

  it('Rochade mit Null und O, lange Rochade, Umwandlung in Dame und Springer', () => {
    expect(sans('1. d4 d5 2. Sc3 Sc6 3. Lf4 Lf5 4. Dd2 Dd7 5. 0-0-0 O-O-O')).toContain('O-O-O');
    const promo = parseMoveInput('[SetUp "1"]\n[FEN "8/4P1k1/8/8/8/8/1p4K1/8 w - - 0 1"]\n\n1. e8=D b1=S')!;
    expect(promo.history()).toEqual(['e8=Q', 'b1=N']);
  });

  it('mit Kopfzeilen, Kommentaren, Varianten und Bewertungszeichen', () => {
    const pgn = '[Event "Schülerliga"]\n\n1. e4 {gut} e5 2. Sf3 (2. Lc4 Sf6) 2... Sc6 $1 3. Lb5!? a6 *';
    expect(sans(pgn)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  });

  it('leer → keine Züge', () => {
    expect(parseMoveInput('   ')).toBeNull();
  });

  it('ungültiger Zug: Meldung mit Zugnummer, Farbe und dem Zug, wie er eingegeben wurde', () => {
    expect(errorOf('1. e4 e5 2. Sf3 Sc6 3. Lb5 a6 4. Lxc7')).toBe('Zug 4. Lxc7 (Weiß) ist in dieser Stellung nicht möglich.');
    expect(errorOf('1. e4 e5 2. Sf3 Sf5')).toBe('Zug 2 … Sf5 (Schwarz) ist in dieser Stellung nicht möglich.');
    expect(errorOf('1. e5')).toBe('Zug 1. e5 (Weiß) ist in dieser Stellung nicht möglich.');
    expect(errorOf('1. e4 e5 2. 0-0')).toBe('Zug 2. 0-0 (Weiß) ist in dieser Stellung nicht möglich.');
    expect(errorOf('Hallo')).toBe('Zug 1. Hallo (Weiß) ist in dieser Stellung nicht möglich.');
  });

  it('kein Zug im Text', () => {
    expect(errorOf('[Event "x"]\n\n*')).toBe('Im eingefügten Text stehen keine Züge.');
  });
});

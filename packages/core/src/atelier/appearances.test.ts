import { describe, expect, it } from 'vitest';
import { appearancesOf } from './Atelier';

describe('appearances of a character', () => {
  it('are the scenes naming them, by full or first name, as whole words', () => {
    const outline = [
      { id: 'c1', title: 'Un', order: 'a', scenes: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] },
    ] as never;
    const texts = new Map([
      ['s1', 'Hélène Varenne entra.'],
      ['s2', 'Plus tard, Hélène se tut.'],
      ['s3', 'Les Hélènes de Troie… Varenne absente.'],
    ]);
    expect(appearancesOf('Hélène Varenne', outline, texts)).toEqual(['s1', 's2']);
    expect(appearancesOf('Al', outline, texts)).toEqual([]);
  });
});

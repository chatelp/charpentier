import { describe, expect, it } from 'vitest';
import { countWords } from './word-count';

describe('countWords', () => {
  it('counts French prose the way a writer does', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  \n ')).toBe(0);
    expect(countWords('— Vous venez ? demanda-t-elle.')).toBe(3);
    expect(countWords('« Il pleuvait » sur l’Odyssée.')).toBe(4);
    expect(countWords('Chapitre 12, 1984.')).toBe(3);
  });
});

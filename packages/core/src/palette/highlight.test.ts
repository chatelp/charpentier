import { describe, expect, it } from 'vitest';
import { matchRanges } from './highlight';

describe('matchRanges', () => {
  it('finds accent-insensitive matches with the label’s own indexes', () => {
    expect(matchRanges('Nouvelle scène', 'scene')).toEqual([[9, 14]]);
    expect(matchRanges('Nouveau chapitre', 'NOUV chap')).toEqual([
      [0, 4],
      [8, 12],
    ]);
    expect(matchRanges('Hélène', 'ele ene')).toEqual([[1, 6]]);
    expect(matchRanges('Scène', '')).toEqual([]);
    expect(matchRanges('Scène', 'xyz')).toEqual([]);
  });
});

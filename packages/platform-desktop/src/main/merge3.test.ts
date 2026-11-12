import { describe, expect, it } from 'vitest';
import { blocksOf, merge3 } from './merge3';

describe('merge3', () => {
  const base = ['A.', 'B.', 'C.', 'D.'];
  it('combines changes to different paragraphs', () => {
    expect(merge3(base, ['A!', 'B.', 'C.', 'D.'], ['A.', 'B.', 'C.', 'D!'])).toEqual({
      ok: true,
      merged: ['A!', 'B.', 'C.', 'D!'],
    });
    expect(merge3(base, ['A.', 'B.', 'C.', 'D.', 'E.'], ['A.', 'C.', 'D.'])).toEqual({
      ok: true,
      merged: ['A.', 'C.', 'D.', 'E.'],
    });
  });

  it('takes the outside edit when the app did not change anything', () => {
    expect(merge3(base, base, ['A.', 'B bis.', 'C.'])).toEqual({
      ok: true,
      merged: ['A.', 'B bis.', 'C.'],
    });
  });

  it('accepts the same change made on both sides', () => {
    expect(merge3(base, ['A.', 'B!', 'C.', 'D.'], ['A.', 'B!', 'C.', 'D.']).ok).toBe(true);
  });

  it('conflicts when both sides change the same paragraph', () => {
    expect(merge3(base, ['A.', 'B app.', 'C.', 'D.'], ['A.', 'B fichier.', 'C.', 'D.'])).toEqual({
      ok: false,
    });
    // Inserting at the same place on both sides is a conflict too.
    expect(merge3(base, ['A.', 'X.', 'B.', 'C.', 'D.'], ['A.', 'Y.', 'B.', 'C.', 'D.']).ok).toBe(
      false,
    );
  });

  it('splits Markdown into paragraphs', () => {
    expect(blocksOf('Un.\r\n\r\n> Deux.\n> suite\n\n\n* * *\n')).toEqual([
      'Un.',
      '> Deux.\n> suite',
      '* * *',
    ]);
  });
});

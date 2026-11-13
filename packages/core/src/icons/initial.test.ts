import { describe, expect, it } from 'vitest';
import { initialOf } from './Pictogram';

describe('monogram initial (docs/DESIGN.md §4.11)', () => {
  it('takes the first letter without the article', () => {
    expect(initialOf('Hélène Varenne')).toBe('H');
    expect(initialOf('Le technicien')).toBe('T');
    expect(initialOf('la serre')).toBe('S');
    expect(initialOf('L’enquêtrice')).toBe('E');
    expect(initialOf("d'Artagnan")).toBe('A');
    expect(initialOf('Le')).toBe('L');
    expect(initialOf('')).toBe('');
  });
});

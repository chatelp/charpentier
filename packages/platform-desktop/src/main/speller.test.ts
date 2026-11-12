import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSpeller } from './speller';

// The French dictionary shipped with the desktop app.
const dir = fileURLToPath(
  new URL('../../../../apps/desktop/resources/dictionaries/fr/', import.meta.url),
);

describe('French Hunspell', () => {
  const speller = createSpeller(
    fs.readFileSync(path.join(dir, 'fr.aff')),
    fs.readFileSync(path.join(dir, 'fr.dic')),
  );

  it('knows French words, capitalized or with typographic apostrophes', () => {
    expect(
      speller.misspelled(['Il', 'pleuvait', 'enquêtrice', 'aujourd’hui', 'pleuvai', 'chevals']),
    ).toEqual(['pleuvai', 'chevals']);
  });

  it('suggests corrections', () => {
    expect(speller.suggest('pleuvai')).toContain('pleuvait');
    expect(speller.suggest('enquetrice')).toContain('enquêtrice');
  });
}, 30_000);

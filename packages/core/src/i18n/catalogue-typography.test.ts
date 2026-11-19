import { describe, expect, it } from 'vitest';
import { typographyIssues } from '../language/typography';
import fr from './locales/fr.json';

/** Every text of the catalogue, with its key path. */
function texts(node: unknown, path: string[] = []): { key: string; text: string }[] {
  if (typeof node === 'string') return [{ key: path.join('.'), text: node }];
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, child]) => texts(child, [...path, key]));
}

/**
 * The prose of a text: what is not a sentence is masked by a neutral word
 * ({{interpolations}}, addresses, key patterns), so that no rule reads it.
 */
const prose = (text: string): string =>
  text.replace(/\{\{[^}]*\}\}/g, 'x').replace(/\b[a-z]+:\/\/\S*/g, 'x');

const catalogue = texts(fr).map(({ key, text }) => ({ key, text: prose(text) }));
const failing = (pattern: RegExp) =>
  catalogue.filter(({ text }) => pattern.test(text)).map(({ key }) => key);

/**
 * The interface follows the typography the app asks of the author's text
 * (language/typography.ts): U+00A0 before « : » and inside « », U+202F before
 * « ; ? ! », the typographic apostrophe.
 */
describe('the French catalogue’s typography', () => {
  it('has no ordinary space before « : ; ? ! » »', () => {
    expect(failing(/ [:;?!»]/u)).toEqual([]);
  });

  it('has no ordinary space after « « »', () => {
    expect(failing(/« /u)).toEqual([]);
  });

  it('has no straight apostrophe in prose', () => {
    expect(failing(/'/u)).toEqual([]);
  });

  it('passes the house rules on spaces, guillemets and apostrophes', () => {
    const rules = new Set([
      'space-before-high-punctuation',
      'space-before-colon',
      'space-after-opening-guillemet',
      'space-before-closing-guillemet',
      'apostrophe',
    ]);
    const issues = catalogue.flatMap(({ key, text }) =>
      typographyIssues(text)
        .filter((issue) => issue.rule !== undefined && rules.has(issue.rule))
        .map((issue) => `${key}: ${issue.rule} in « ${text} »`),
    );
    expect(issues).toEqual([]);
  });
});

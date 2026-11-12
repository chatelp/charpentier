import type { LanguageIssue } from './issues';

/** U+00A0, before « : » and inside guillemets. */
export const NBSP = '\u00A0';
/** U+202F, before « ; ! ? ». */
export const NNBSP = '\u202F';

interface Rule {
  readonly id: string;
  readonly pattern: RegExp;
  /** Replacement of the whole match. */
  readonly replace: (match: RegExpExecArray) => string;
}

const SPACES = '[ \\t\\u00A0\\u202F\\u2009]';

/**
 * French typography rules (docs/SPEC.md §8, D-10), offline. Each rule matches
 * the smallest stretch to replace, so that accepting a correction touches
 * nothing else.
 */
const RULES: readonly Rule[] = [
  {
    // « Vous venez? » / « Vous venez ? » → narrow no-break space before ; ! ?
    id: 'space-before-high-punctuation',
    pattern: new RegExp(`(?<=[\\p{L}\\p{N}»)\\]…])(?:${SPACES}?)(?<!\\u202F)([;!?])`, 'gu'),
    replace: (m) => `${NNBSP}${m[1]}`,
  },
  {
    // « Il dit: » → no-break space before the colon (not in times like 10:30).
    id: 'space-before-colon',
    pattern: new RegExp(`(?<=[\\p{L}»)\\]…])(?:${SPACES}?)(?<!\\u00A0):(?!\\d)`, 'gu'),
    replace: () => `${NBSP}:`,
  },
  {
    // « guillemets » with no-break spaces inside.
    id: 'space-after-opening-guillemet',
    pattern: new RegExp(`«(?:${SPACES}?)(?<!«\\u00A0)(?=\\S)`, 'gu'),
    replace: () => `«${NBSP}`,
  },
  {
    id: 'space-before-closing-guillemet',
    pattern: new RegExp(`(?<=\\S)(?:${SPACES}?)(?<!\\u00A0)»`, 'gu'),
    replace: () => `${NBSP}»`,
  },
  {
    // "texte" → « texte »
    id: 'straight-quotes',
    pattern: /"([^"\n]+)"/gu,
    replace: (m) => `«${NBSP}${(m[1] ?? '').trim()}${NBSP}»`,
  },
  {
    // l'Odyssée → l’Odyssée
    id: 'apostrophe',
    pattern: /(?<=\p{L})'(?=\p{L})/gu,
    replace: () => '’',
  },
  {
    // - Vous venez ? → — Vous venez ? (dialogue dash at the start of a paragraph)
    id: 'dialogue-dash',
    pattern: /^(?:-{1,2}|–)[ \u00A0](?=\S)/gu,
    replace: () => `—${NBSP}`,
  },
  {
    id: 'ellipsis',
    pattern: /(?<!\.)\.\.\.(?!\.)/gu,
    replace: () => '…',
  },
  {
    id: 'double-space',
    pattern: /(?<=\S) {2,}(?=\S)/gu,
    replace: () => ' ',
  },
];

/** Typography issues of one paragraph's text. */
export function typographyIssues(text: string): LanguageIssue[] {
  const issues: LanguageIssue[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (let m = rule.pattern.exec(text); m; m = rule.pattern.exec(text)) {
      if (m[0].length === 0) {
        rule.pattern.lastIndex++;
        continue;
      }
      const replacement = rule.replace(m);
      if (replacement === m[0]) continue;
      issues.push({
        from: m.index,
        to: m.index + m[0].length,
        kind: 'typography',
        rule: rule.id,
        replacement,
      });
    }
  }
  // Overlapping rules: keep the first one found at each place.
  issues.sort((a, b) => a.from - b.from || b.to - a.to);
  return issues.filter((issue, i) => i === 0 || issue.from >= (issues[i - 1]?.to ?? 0));
}

/** Applies every typography correction to a text (for tests and « tout corriger »). */
export function applyTypography(text: string): string {
  let out = text;
  for (const issue of [...typographyIssues(text)].reverse())
    out = out.slice(0, issue.from) + (issue.replacement ?? '') + out.slice(issue.to);
  return out;
}

/**
 * The « AI never writes the novel » guardrails (docs/SPEC.md §18, D-11),
 * applied to every answer of the Compagnon before it reaches the author.
 * An answer that breaks them is rejected (another attempt, or a refusal),
 * never silently cut.
 */

import { isOneSentence, MAX_EXAMPLE_LENGTH, sentencesOf } from '@charpentier/schema';

export { isOneSentence, MAX_EXAMPLE_LENGTH, sentencesOf };

/** A quotation longer than this must come from the author's own text. */
const MAX_FOREIGN_QUOTE = 80;
/** A quotation longer than this is a passage, whatever it holds. */
const MAX_QUOTE = 160;
/** An answer in the conversation, at most (about four times « développez »). */
export const MAX_REPLY_LENGTH = 6000;

const normalize = (s: string) =>
  s
    .normalize('NFC')
    .replace(/[’']/g, "'")
    .replace(/[«»“”"]/g, '"')
    .replace(/[\s\u00A0\u202F]+/g, ' ')
    .trim()
    .toLowerCase();

export interface ProseViolation {
  readonly kind: 'dialogue' | 'quote' | 'example' | 'narration';
  readonly excerpt: string;
}

export interface ProseOptions {
  /**
   * A note on the book (a sheet's value, a line of the notebook): a
   * backstory is told in the past, so the narration rules are left out;
   * dialogue and foreign passages stay refused.
   */
  readonly notes?: boolean;
}

// ─── Features ───
// Everything below is plain pattern matching on the answer: no model, no
// host API. A feature says little alone; the rules at the end weigh them.

/** A word among these, with letter boundaries that know accents. */
const word = (alternatives: string, flags = 'iu') =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, flags);

/** The Compagnon speaks to the author: « vous », an imperative (« montrez »), "you". */
const ADDRESS = word(
  'vous|votre|vos|vôtres?|you|your|yours|(?!chez|assez|nez|rez)\\p{L}{3,}ez|(?!chez|assez)\\p{L}{2,}ez-(?:vous|le|la|les|en|y)',
);
/** Words of the craft: a sentence that holds one talks about the book, it is not the book. */
const CRAFT = word(
  'scènes?|lecteurs?|lectrices?|chapitres?|récits?|phrases?|paragraphes?|textes?|romans?|narrat\\p{L}*|dialogues?|personnages?|intrigues?|styles?|rythmes?|tension|point de vue|écri\\p{L}*|auteurs?|autrices?|passages?|descriptions?|incipit|dénouement|enjeux?|conflits?|motivations?|thèmes?|métaphores?|verbes?|adjectifs?|adverbes?|imparfait|passé simple|protagonistes?|antagonistes?|procédés?|brouillons?|manuscrit|fiches?|exemples?|principes?|variantes?|' +
    'scenes?|readers?|chapters?|sentences?|paragraphs?|characters?|novels?|stor(?:y|ies)|drafts?|narrat\\p{L}*|writ\\p{L}*|tense|plot|stakes|point of view|examples?|principles?',
);
/** The Compagnon suggests (« pourrait », « et si ») : not narration. */
const SUGGESTION = word('pourrai(?:t|ent)|devrai(?:t|ent)|faudrait|vaudrait|could|should|might');
/** Someone speaks in the first or second person singular: a character, never the Compagnon. */
const SINGULAR = /(?<![\p{L}\p{N}])(?:(?:je|tu|te|toi|moi|ta|tes)(?![\p{L}\p{N}])|[jt]['’])/iu;
/** « je », outside quoted words. */
const FIRST_PERSON = /(?<![\p{L}\p{N}])(?:je(?![\p{L}\p{N}])|j['’])/iu;
/** « Voici la scène : » — what follows is announced as text. */
const ANNOUNCE = word(
  "(?:voici|voilà|here is|here['’]s)[^.!?\\n]{0,60}(?:scène|passage|texte|proposition|version|suite|début|paragraphe|dialogue|réécriture|extrait|scene|text|draft|opening|rewrite)[^.!?\\n]{0,60}:",
);

const CLITICS =
  "(?:(?:ne|n['’]|se|s['’]|me|m['’]|te|t['’]|le|la|l['’]|les|lui|leur|y|en|nous|vous)\\s*)*";

/** Not imperfects: nouns and participles in -ait. */
const NOT_IMPERFECT = new Set(
  'trait portrait extrait retrait attrait abstrait distrait satisfait parfait imparfait défait refait forfait méfait bienfait souhait soustrait contrefait stupéfait surfait aient'.split(
    ' ',
  ),
);
/** Imperfects that look like conditionals (« tirait », « serrait »). */
const IMPERFECT_IN_R = word(
  '(?:re|at|é)?tir|respir|soupir|désir|admir|déchir|vir|inspir|expir|aspir|serr|err|barr|bourr|fourr|narr',
);
const CONDITIONAL = /(?:e|i|r|d|au|tt|ît|dev|recev)r(?:ait|aient)$/iu;
const IMPERFECT = /(?<!\p{L})(\p{L}{2,}?)(ait|aient)(?!\p{L})/giu;

/** Simple pasts in the third person that no present shares. */
const SIMPLE_PAST = word(
  'fut|eut|fit|vint|prit|mit|put|dut|sut|voulut|tint|parut|sentit|sortit|partit|ouvrit|comprit|reprit|surprit|apprit|revint|devint|assit|courut|aperçut|reçut|crut|vécut|mourut|suivit|' +
    '(?:répon|enten|atten|descen|ren|ten|per|ven|défen|suspen|éten|préten|confon|fon|mor|tor)dit|' +
    '(?!(?:esp|préf|consid|sugg|op|g|lib|exag|accél|tol|réf|diff|ins|récup|énum|rév|dés|réit|rep|poss|altr|adh)èrent)\\p{L}{2,}èrent|' +
    '(?!(?:re|at)?tirent|respirent|soupirent|désirent|admirent|déchirent|inspirent|aspirent|expirent|virent)\\p{L}{2,}irent|' +
    '(?:f|e|p|d|s|voul|par|cour|reç|aperç|cr|véc|mour|conn|l|dispar|appar)urent|\\p{L}{2,}inrent',
);
/** Nouns in -a, where a simple past is looked for after a subject. */
const NOT_PAST_IN_A = new Set(
  'cela cinéma schéma panorama sofa villa véranda pizza agenda visa coma papa gala diva média alinéa delta alpha sauna saga mafia tombola vodka'.split(
    ' ',
  ),
);
const PAST_IN_RA = word(
  '(?:r|ren)?entra|(?:dé)?montra|rencontra|pénétra|(?:re|at)?tira|pleura|murmura|serra|soupira|respira|demeura|jura|dura|déchira|effleura|admira|assura|rassura|ignora|adora|dévora|sépara|prépara|empara|éclaira|espéra|libéra',
);
const PAST_IN_A = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:[Ii]l|[Ee]lle|[Oo]n|qui|\\p{Lu}\\p{Ll}+|(?:[Ll]es?|[Ll]a|[Ll]['’]|[Uu]ne?|[Ss]on|[Ss]a|[Ss]es|[Ll]eurs?|[Cc]e|[Cc]ette|[Cc]es)\\s*\\p{L}+)\\s+${CLITICS}(\\p{Ll}{3,}a)(?![\\p{L}\\p{N}])`,
  'gu',
);
const FIRST_PERSON_PAST = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:je|j['’])\\s*${CLITICS}(\\p{L}{2,}ais|\\p{L}{3,}ai|fus|eus|pris|mis|fis|vins|tins|sortis|partis|entendis|répondis|compris|ouvris|descendis|attendis|sentis)(?![\\p{L}\\p{N}])`,
  'giu',
);
const NOT_FIRST_PERSON_PAST = new Set(
  'fais sais vais connais plais hais parais apparais disparais nais'.split(' '),
);
const ENGLISH_PAST = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:(?:[Hh]e|[Ss]he|[Tt]hey|I|[Ww]e)\\s+(?:\\p{Ll}{3,}ed|was|were|had|said|went|came|saw|took|stood|sat|felt|knew|thought|ran|fell|held|left|heard)|\\p{Lu}\\p{Ll}+\\s+(?:was|were|had|said|went|came|saw|took|stood|sat|felt|knew|thought|ran|fell|held|heard|looked|turned|opened|closed|walked|waited|watched))(?![\\p{L}\\p{N}])`,
  'gu',
);

/** How many verbs of a sentence are in a tense of narration (simple past, imperfect). */
function narrativePasts(sentence: string): number {
  let count = 0;
  for (const m of sentence.matchAll(IMPERFECT)) {
    const verb = m[0].toLowerCase();
    if (NOT_IMPERFECT.has(verb)) continue;
    if (CONDITIONAL.test(verb) && !IMPERFECT_IN_R.test(verb.replace(/(?:ait|aient)$/u, '')))
      continue;
    count++;
  }
  count += [...sentence.matchAll(new RegExp(SIMPLE_PAST.source, 'giu'))].length;
  for (const m of sentence.matchAll(PAST_IN_A)) {
    const verb = (m[1] ?? '').toLowerCase();
    if (NOT_PAST_IN_A.has(verb)) continue;
    if (verb.endsWith('ra') && !PAST_IN_RA.test(verb)) continue; // « sera », « viendra ».
    count++;
  }
  for (const m of sentence.matchAll(FIRST_PERSON_PAST)) {
    const verb = (m[1] ?? '').toLowerCase();
    if (NOT_FIRST_PERSON_PAST.has(verb) || /rais?$/u.test(verb)) continue; // « j’aimerais ».
    count++;
  }
  count += [...sentence.matchAll(ENGLISH_PAST)].length;
  return count;
}

/** A sentence of the novel: told in the past, to no one, about no craft, asking nothing. */
function isNarrativeSentence(sentence: string): boolean {
  if (/\?\s*[»"”)]?\s*$/u.test(sentence)) return false;
  if (ADDRESS.test(sentence) || CRAFT.test(sentence) || SUGGESTION.test(sentence)) return false;
  if (/^(?:et\s+)?si\s/iu.test(sentence)) return false;
  return narrativePasts(sentence) > 0;
}

/** A speech tag after a line of dialogue: « , dit-elle », « ? demanda Paul », « ! s’écria-t-il ». */
const SPEECH_VERB =
  "(?:s['’]\\s*)?(?:dit|dis|demand|répon|répond|murmur|cri|s['’]écri|souffl|lan[cç]|repri|repren|fit|ajout|chuchot|hurl|soupir|répliqu|interromp|poursuiv|continu|grogn|gémi|balbuti|bredouill|protest|insist|avou|admit|coup)\\p{L}*(?:-t)?(?:-(?:il|elle|ils|elles|on|je|tu|nous|vous)(?![\\p{L}])|\\s+\\p{Lu})";
const SPEECH_TAG = new RegExp(`[,!?…]\\s*[»"”]?\\s*,?\\s*${SPEECH_VERB}`, 'u');
/** After a closing quote: « … », dit Hélène. */
const TAG_AFTER_QUOTE = new RegExp(`^\\s*,?\\s*${SPEECH_VERB}`, 'u');
/** "…," she said. / "…?" asked Paul. */
const ENGLISH_SPEECH =
  /[,!?.…]["”]\s*(?:(?:she|he|they|I|we|\p{Lu}\p{Ll}+)\s+)?(?:said|asked|whispered|replied|murmured|shouted|answered|cried|muttered|called|sighed)(?!\p{L})/u;

const DASH = /^(—|–|-{2,}|-|•|\*)\s*(.*)$/u;
const INFINITIVE_LEAD =
  /^(?!pierre|notre|votre|entre|encore|contre|autre|quatre|hier|premier|dernier)\p{L}{3,}(?:er|ir|re)(?!\p{L})/iu;

/** An item of a list of the Compagnon (a question to the author, a point of craft), not a line of dialogue. */
function isListItem(whole: string, dash: string): boolean {
  if (!/[.!?…][»"”)]?$/u.test(whole)) return true; // A noun phrase: « Le désir d’Hélène »
  // Its first sentence decides: « — Tu viens ? Le dialogue claque. » is dialogue.
  const body = sentencesOf(whole)[0] ?? whole;
  if (CRAFT.test(body)) return true;
  if (/^[^.!?]{1,60}\s:\s/u.test(body) || /^\*\*/.test(body)) return true; // « Le désir : … »
  if (INFINITIVE_LEAD.test(body)) return true; // « Resserrer l’ouverture. »
  if (word('vous\\s+(?:pourriez|devriez|gagneriez)|(?:pourriez|devriez)-vous').test(body))
    return true;
  const question = /\?\s*[»"”)]?$/u.test(body);
  if (dash === '—')
    // The dash of French dialogue: a question stays one of the Compagnon's only when it speaks to the author.
    return question && ADDRESS.test(body) && !SINGULAR.test(body);
  // « – », « -- » : a list as often as dialogue. Dialogue when a character says « je » or « tu », or cries out.
  if (question) return !SINGULAR.test(body);
  return !(SINGULAR.test(body) || /!/.test(body) || word('vous').test(body));
}

/**
 * A line of dialogue: a dash then speech. A single hyphen or a bullet opens
 * a list item (the Compagnon's questions to the author), unless the line
 * carries a speech tag (choice of the author, 18 November 2026: a list of
 * questions is not dialogue). « – » and « -- » open either: see isListItem.
 */
function isDialogueLine(line: string): boolean {
  const match = DASH.exec(line);
  if (!match) return false;
  const [, dash = '', body = ''] = match;
  if (!/^[«"“]?\s*\p{L}/u.test(body)) return false;
  if (SPEECH_TAG.test(body)) return true;
  if (dash === '-' || dash === '•' || dash === '*') return false;
  return !isListItem(body, dash);
}

const QUOTED = /«\s*([^»]+?)\s*»|“([^”]+)”|"([^"\n]+)"/gu;

/**
 * Narrative text the Compagnon must not produce (docs/SPEC.md §18, D-11):
 * lines of dialogue, narration, or passages presented as text (quotes,
 * quoted blocks) that are not the author's own words.
 *
 * The rules, each on features of the answer alone:
 * - dialogue: a dash then speech (not a list item); a speech tag after
 *   quoted words (« … », dit Hélène ; "…," she said) or with an inversion;
 * - quote: a quoted passage over 80 characters that is several sentences
 *   or told in the past, or any over 160, or a quoted block over 80;
 * - narration: sentences told in the simple past or the imperfect (third
 *   or first person) that speak to no one, ask nothing and name no craft:
 *   two in a row, two making up 40 % of the answer, three anywhere, or one
 *   after an announcement (« Voici la scène : ») ; or a paragraph of four
 *   sentences and 250 characters with no address, question or craft word.
 * What the author wrote (authorText) is never a violation.
 */
export function narrativeProseIn(
  answer: string,
  authorText: string,
  options: ProseOptions = {},
): ProseViolation[] {
  const author = normalize(authorText);
  /** The author's words, even cut (« […] », « … ») or without their last point. */
  const fromAuthor = (s: string) => {
    const parts = normalize(s)
      .split(/\s*(?:\[…\]|\[\.\.\.\]|\(…\)|…|\.\.\.)\s*/u)
      .map((part) => part.replace(/^[\s,;:]+|[\s.,;:!?]+$/gu, ''))
      .filter(Boolean);
    // A cut quotation is the author's when each piece is long enough to be no accident.
    if (parts.length > 1 && parts.some((part) => part.length < 12)) return false;
    return parts.length > 0 && parts.every((part) => author.includes(part));
  };
  const violations: ProseViolation[] = [];
  const add = (kind: ProseViolation['kind'], text: string) =>
    violations.push({ kind, excerpt: text.slice(0, 120) });

  const lines = answer.split('\n').map((line) => line.trim());
  for (const line of lines) {
    // A dialogue line: dash then speech.
    if (isDialogueLine(line) && !fromAuthor(line.replace(DASH, '$2'))) add('dialogue', line);
    // A quoted block.
    if (/^>/.test(line)) {
      const quoted = line.replace(/^>\s*/, '');
      if (quoted.length > MAX_FOREIGN_QUOTE && !fromAuthor(quoted)) add('quote', quoted);
    }
    if (ENGLISH_SPEECH.test(line) && !fromAuthor(line)) add('dialogue', line);
  }
  for (const match of answer.matchAll(QUOTED)) {
    const quoted = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    const after = answer.slice((match.index ?? 0) + match[0].length).split('\n')[0] ?? '';
    // « Je reste », dit Hélène. The author's line when they wrote the words and the tag together.
    const tag = TAG_AFTER_QUOTE.exec(after)?.[0];
    if (tag !== undefined) {
      if (!fromAuthor(`${quoted}, ${tag.replace(/^[\s,]+/u, '')}`)) add('dialogue', match[0] + tag);
      continue;
    }
    if (fromAuthor(quoted)) continue;
    // « Je reste, dit-elle, jusqu’à la crue. »
    if (SPEECH_TAG.test(quoted)) add('dialogue', match[0]);
    else if (
      quoted.length > MAX_QUOTE ||
      (quoted.length > MAX_FOREIGN_QUOTE &&
        (sentencesOf(quoted).length > 1 || (narrativePasts(quoted) > 0 && !CRAFT.test(quoted))))
    )
      add('quote', quoted);
  }
  if (options.notes) return violations;

  // ─── Narration ───
  // The author's own words, quoted or not, are taken out first.
  const paragraphs = lines
    .filter((line) => line && !(line.startsWith('>') && fromAuthor(line.replace(/^>\s*/, ''))))
    .map((line) =>
      sentencesOf(
        line
          .replace(/^(?:—|–|-{1,}|•|\*|>|\d+[.)])\s*/u, '')
          .replace(QUOTED, (all: string, a?: string, b?: string, c?: string) =>
            fromAuthor(a ?? b ?? c ?? '') ? '…' : all,
          ),
      ).filter((sentence) => !(sentence.length >= 15 && fromAuthor(sentence))),
    );
  const sentences = paragraphs.flat();
  const narrative = sentences.map(isNarrativeSentence);
  const count = narrative.filter(Boolean).length;
  const firstRun = narrative.findIndex((n, i) => n && narrative[i + 1]);
  const first = sentences[narrative.indexOf(true)] ?? '';
  if (firstRun !== -1) add('narration', `${sentences[firstRun]} ${sentences[firstRun + 1]}`);
  else if (count >= 3 || (count === 2 && count / sentences.length >= 0.4)) add('narration', first);
  else if (count >= 1 && ANNOUNCE.test(answer)) add('narration', first);
  else
    for (const paragraph of paragraphs) {
      // Prose in the present: a long paragraph that speaks to no one about no craft.
      const text = paragraph.join(' ');
      if (
        paragraph.length >= 4 &&
        text.length >= 250 &&
        !ADDRESS.test(text) &&
        !CRAFT.test(text) &&
        !SUGGESTION.test(text) &&
        !/\?/.test(text) &&
        !FIRST_PERSON.test(text.replace(/[«"“][^»"”]*[»"”]/gu, ''))
      ) {
        add('narration', text);
        break;
      }
    }
  return violations;
}

/** The sentences of an answer told as the novel would tell them (see narrativeProseIn). */
export function narrativeSentencesIn(answer: string, authorText: string): string[] {
  const author = normalize(authorText);
  return answer
    .split('\n')
    .flatMap((line) => sentencesOf(line))
    .filter((s) => isNarrativeSentence(s) && !author.includes(normalize(s)));
}

/**
 * A text that outgrew its bound, cut where a sentence ends and marked
 * « […] » : never cut in silence (docs/SPEC.md §18). For what is kept for
 * the record (a review, a summary); what is shown as an answer is refused whole.
 */
export const CUT_MARK = ' […]';
export function cutMarked(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = text.slice(0, max - CUT_MARK.length);
  const ends = [...room.matchAll(/[.!?…][»"”)]?(?=\s)/gu)];
  const last = ends.at(-1);
  const end = last ? (last.index ?? 0) + last[0].length : 0;
  return (end > max / 2 ? room.slice(0, end) : room.trimEnd()) + CUT_MARK;
}

/** Edit distance ratio between a segment and its correction (a correction must stay a correction). */
export function changeRatio(original: string, corrected: string): number {
  const a = [...original];
  const b = [...corrected];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = current;
  }
  return (previous[b.length] ?? 0) / Math.max(1, a.length);
}

/** A language correction may change at most this share of its segment. */
export const MAX_CORRECTION_RATIO = 0.35;

/**
 * A correction fixes a few words: the passage it replaces and its own text
 * stay short, whatever the ratio allows on a long passage.
 */
export const MAX_CORRECTION_LENGTH = 200;
/** A correction may be this much longer than its passage (a missing word, an agreement). */
export const MAX_CORRECTION_GROWTH = 30;

/**
 * Sentences of a passage, counted by the closing punctuation that text
 * follows. Stricter than `sentencesOf`: a sentence added without its capital
 * counts, and giving a sentence the capital it lacked adds none.
 */
const sentenceCount = (text: string) => 1 + (text.match(/[.!?…]+(?=[^.!?…]*\p{L})/gu) ?? []).length;

/**
 * A language correction the author may accept (D-11): it stays a correction
 * of its passage and cannot carry new text. Short passage, short correction,
 * one line, no sentence more than the passage has, few characters added, and
 * a bounded share of the passage changed.
 */
export function isBoundedCorrection(quote: string, correction: string): boolean {
  const from = quote.trim();
  const to = correction.trim();
  if (!from || !/\p{L}/u.test(to)) return false;
  if ([...from].length > MAX_CORRECTION_LENGTH || [...to].length > MAX_CORRECTION_LENGTH)
    return false;
  if (/[\n\r\u2028\u2029]/.test(correction)) return false;
  if ([...to].length - [...from].length > MAX_CORRECTION_GROWTH) return false;
  if (sentenceCount(to) > sentenceCount(from)) return false;
  return changeRatio(from, to) <= MAX_CORRECTION_RATIO;
}

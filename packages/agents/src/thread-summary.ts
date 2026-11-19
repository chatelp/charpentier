import type { LlmService } from '@charpentier/platform';
import {
  agentOrigin,
  readThreadSummary,
  writeThreadSummary,
  type ThreadMessage,
} from '@charpentier/schema';
import type * as Y from 'yjs';
import { cutMarked } from './guard';

/**
 * The rolling summary of the thread (docs/PLAN.md phase 6.5, D-35): what
 * left the window of messages sent with a call is kept as a summary,
 * rewritten with each block that leaves, by a light call; it goes first in
 * every call, in the cached part. The notebook keeps what matters by the
 * Compagnon's choice; the summary is the net under it.
 */

/** Characters, at most: about a thousand words. */
export const MAX_SUMMARY = 6000;
/** Messages a summary takes in at once, at most (a summary lost or merged away starts again from there). */
const MAX_BLOCK = 400;

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
  additionalProperties: false,
} as const;

export function summarySystemPrompt(language: string): string {
  return `You keep the summary of a long exchange between an author writing a novel and their writing mentor, the Compagnon. You get the summary so far and the next messages; answer with the new summary, in the language of the project (${language}), at most about 900 words. Keep what the Compagnon will need later: what the author said of their book and of themselves, their intentions, decisions and why, doubts, questions left open, what was agreed, how things evolved (with when, roughly). Shorten the oldest parts first. Plain prose or short dashes; never lines of the novel or dialogue written for it.`;
}

const line = (m: ThreadMessage) =>
  `[${m.at.slice(0, 10)} · ${m.role === 'author' ? 'author' : 'Compagnon'} · ${m.mode}] ${m.text}`;

/**
 * The summary of the thread before `start` (the first message sent), brought
 * up to date when messages left the window since it was written. Undefined
 * when nothing left it. A failed call keeps the previous summary: the
 * answer does not wait on it.
 */
export async function keepThreadSummary(input: {
  readonly llm: LlmService;
  readonly mentorDoc: Y.Doc;
  readonly thread: readonly ThreadMessage[];
  readonly start: number;
  readonly language: string;
  readonly signal?: AbortSignal;
}): Promise<string | undefined> {
  const { thread, start, mentorDoc } = input;
  if (start <= 0) return undefined;
  const current = readThreadSummary(mentorDoc);
  const coveredUpTo = current ? thread.findIndex((m) => m.id === current.upTo) : -1;
  const from = current && coveredUpTo === -1 ? Math.max(0, start - MAX_BLOCK) : coveredUpTo + 1;
  const left = thread.slice(Math.max(from, start - MAX_BLOCK), start);
  if (left.length === 0) return current?.text;
  try {
    const response = await input.llm.generate(
      {
        system: summarySystemPrompt(input.language),
        messages: [
          {
            role: 'user',
            content: `<summary-so-far>\n${current?.text ?? '(none yet)'}\n</summary-so-far>\n<next-messages>\n${left.map(line).join('\n')}\n</next-messages>`,
          },
        ],
        responseSchema: SUMMARY_SCHEMA,
        maxOutputTokens: 4000,
        tier: 'fast',
      },
      input.signal,
    );
    const summary = (JSON.parse(response.text) as { summary?: unknown }).summary;
    if (typeof summary !== 'string' || !summary.trim()) return current?.text;
    // Over its bound, the summary says where it was cut (« […] ») : the next one is built on it.
    const text = cutMarked(summary.trim(), MAX_SUMMARY);
    const last = left.at(-1);
    if (last)
      writeThreadSummary(
        mentorDoc,
        { text, upTo: last.id, covered: start },
        agentOrigin('thread-summary'),
      );
    return text;
  } catch (error) {
    if (input.signal?.aborted) throw error;
    return current?.text;
  }
}

import type { LlmService } from '@charpentier/platform';
import { UnusableAnswerError } from './answer';
import type { BookContext } from './book-context';
import { isOneSentence, narrativeProseIn } from './guard';
import {
  atelierContext,
  generateWithMemory,
  MEMORY_INSTRUCTIONS,
  memoryContext,
  type MemoryStore,
  stableThread,
} from './memory';
import { compagnonSystemPrompt, chatAnswerSchema, type MentorLevel } from './prompts';

export interface ChatContext {
  /** BCP 47 language of the project (the Compagnon answers in it). */
  readonly language: string;
  readonly level: MentorLevel;
  readonly projectTitle: string;
  /** The scene being written (active variant), if any. */
  readonly scene?: { readonly title: string; readonly text: string };
  /** The project's sheets, summarized as text. */
  readonly sheets?: string;
  /** The notebook, read only (a chapter's review): see notebookForReading. */
  readonly notebook?: string;
  /** The summary of the thread before the messages sent (phase 6.5). */
  readonly earlier?: string;
  /** Sent with the last words: the oldest messages sent are about to go. */
  readonly alert?: string;
  /** The Atelier and the notebook, before the thread (cached), and what changed since. */
  readonly book?: BookContext;
}

export interface ChatTurn {
  readonly role: 'author' | 'compagnon';
  readonly text: string;
}

export interface ChatAnswer {
  readonly reply: string;
  /** One example sentence the author may insert by an explicit action (D-11). */
  readonly example?: string;
  /** The id the model gave of a style choice its answer relies on (checked by the caller). */
  readonly styleChoiceId?: string;
  /** True when the model's answer still broke the rule and a refusal was given instead. */
  readonly guarded?: boolean;
}

/** Texts the agents themselves say, by language (the UI's catalogue is not reachable here). */
const FALLBACK: Record<string, string> = {
  fr: 'Je préfère ne pas proposer de texte pour votre roman : c’est votre voix qui compte. Dites-moi ce qui vous retient dans ce passage, et cherchons ensemble.',
  en: 'I would rather not write text for your novel: your voice is what matters. Tell me what holds you back in this passage, and let us look for it together.',
};

const CORRECTION = `Your previous answer broke THE RULE: it contained text written for the novel (dialogue, narrative passages, or more than one example sentence). Answer again without any of it. At most one example sentence, in "example" only.`;

function contextMessage(context: ChatContext): string {
  const parts = [`<project title="${context.projectTitle}" />`];
  if (context.sheets) parts.push(`<sheets>\n${context.sheets}\n</sheets>`);
  if (context.notebook) parts.push(context.notebook);
  if (context.scene)
    parts.push(`<scene title="${context.scene.title}">\n${context.scene.text}\n</scene>`);
  return `Context of the author's book (their own text, for reference only):\n${parts.join('\n')}`;
}

function parseAnswer(
  text: string,
): { reply: string; example: string | null; styleChoiceId: string | null } | undefined {
  try {
    const value = JSON.parse(text) as {
      reply?: unknown;
      example?: unknown;
      styleChoiceId?: unknown;
    };
    if (typeof value.reply !== 'string' || !value.reply.trim()) return undefined;
    return {
      reply: value.reply.trim(),
      example:
        typeof value.example === 'string' && value.example.trim() ? value.example.trim() : null,
      styleChoiceId: typeof value.styleChoiceId === 'string' ? value.styleChoiceId : null,
    };
  } catch {
    return undefined;
  }
}

/**
 * One answer of the Compagnon in the free conversation (docs/SPEC.md §6.7).
 * Every answer goes through the guardrails; one that breaks them is asked
 * again once, then replaced by a plain refusal. An answer that cannot be
 * read (cut short, not the JSON asked for) is another matter: asked again
 * once as it was, then an UnusableAnswerError, never a refusal the Compagnon
 * did not make.
 */
export async function compagnonChat(
  llm: LlmService,
  context: ChatContext,
  history: readonly ChatTurn[],
  signal?: AbortSignal,
  /** His notebook (phase 6.5): read at every call, written as he goes. */
  memory?: MemoryStore,
  /** An answer the guardrails refused, and why (the live tests show it). */
  onRefused?: (refused: { readonly answer: unknown; readonly why: readonly unknown[] }) => void,
): Promise<ChatAnswer> {
  const authorText = [
    context.scene?.text ?? '',
    ...history.filter((t) => t.role === 'author').map((t) => t.text),
  ].join('\n');
  // From the most stable to the most changing (the prompt cache, phase 6.5):
  // the Atelier and the notebook as they stood when the thread sent began,
  // the thread so far, then, with the author's last words, what changed
  // since and the book as it stands (the scene).
  const lastAuthor = history.at(-1)?.role === 'author' ? history.at(-1) : undefined;
  const past = (lastAuthor ? history.slice(0, -1) : history).map((t) => ({
    role: t.role === 'author' ? ('user' as const) : ('assistant' as const),
    content:
      t.role === 'author'
        ? t.text
        : JSON.stringify({ reply: t.text, example: null, styleChoiceId: null }),
  }));
  const book = context.book;
  const messages = [
    ...(book ? [{ role: 'user' as const, content: book.stable, stable: true }] : []),
    ...stableThread(past, context.earlier),
    {
      role: 'user' as const,
      content: [
        contextMessage(context),
        book ? book.now : memory && atelierContext(memory),
        !book && memory && memoryContext(memory),
        context.alert,
        lastAuthor?.text ?? '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
  const system = memory
    ? `${compagnonSystemPrompt(context)}\n\n${MEMORY_INSTRUCTIONS}`
    : compagnonSystemPrompt(context);

  // How the last attempt ended: the rule broken (a refusal follows), or no answer to read.
  let last: 'guarded' | 'truncated' | 'unreadable' | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const request = {
      system,
      // The correction only after an answer that broke the rule.
      messages:
        last === 'guarded'
          ? [...messages, { role: 'user' as const, content: CORRECTION }]
          : messages,
      responseSchema: chatAnswerSchema,
      maxOutputTokens: 16000,
      tier: 'deep' as const,
    };
    const response = memory
      ? await generateWithMemory(llm, request, memory, signal)
      : await llm.generate(request, signal);
    const answer = response.truncated ? undefined : parseAnswer(response.text);
    if (!answer) {
      last = response.truncated ? 'truncated' : 'unreadable';
      onRefused?.({ answer: response.text, why: [last] });
      continue;
    }
    const exampleOk = answer.example === null || isOneSentence(answer.example);
    const inReply = narrativeProseIn(answer.reply, authorText);
    const inExample =
      answer.example === null
        ? []
        : narrativeProseIn(answer.example, authorText).filter((v) => v.kind === 'quote');
    const proseFree = inReply.length === 0 && inExample.length === 0;
    if (!(exampleOk && proseFree))
      onRefused?.({
        answer,
        why: [...(exampleOk ? [] : ['example: more than one sentence']), ...inReply, ...inExample],
      });
    if (exampleOk && proseFree)
      return {
        reply: answer.reply,
        ...(answer.example !== null && { example: answer.example }),
        ...(answer.styleChoiceId !== null && { styleChoiceId: answer.styleChoiceId }),
      };
    last = 'guarded';
  }
  if (last !== 'guarded') throw new UnusableAnswerError(last ?? 'unreadable');
  return { reply: FALLBACK[context.language.slice(0, 2)] ?? FALLBACK['fr'] ?? '', guarded: true };
}

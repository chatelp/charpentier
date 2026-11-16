import type { LlmService } from '@charpentier/platform';
import { isOneSentence, narrativeProseIn } from './guard';
import { generateWithMemory, MEMORY_INSTRUCTIONS, memoryContext, type MemoryStore } from './memory';
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
  /** True when the model's answers broke the rule twice and a refusal was given instead. */
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
 * again once, then replaced by a plain refusal.
 */
export async function compagnonChat(
  llm: LlmService,
  context: ChatContext,
  history: readonly ChatTurn[],
  signal?: AbortSignal,
  /** His notebook (phase 6.5): read at every call, written as he goes. */
  memory?: MemoryStore,
): Promise<ChatAnswer> {
  const authorText = [
    context.scene?.text ?? '',
    ...history.filter((t) => t.role === 'author').map((t) => t.text),
  ].join('\n');
  // From the most stable to the most changing (the prompt cache, phase 6.5):
  // the thread so far, then, with the author's last words, the book as it
  // stands (sheets, scene) and the notebook.
  const lastAuthor = history.at(-1)?.role === 'author' ? history.at(-1) : undefined;
  const past = (lastAuthor ? history.slice(0, -1) : history).map((t) => ({
    role: t.role === 'author' ? ('user' as const) : ('assistant' as const),
    content:
      t.role === 'author'
        ? t.text
        : JSON.stringify({ reply: t.text, example: null, styleChoiceId: null }),
  }));
  const before = [
    ...(past[0]?.role === 'user'
      ? []
      : [{ role: 'user' as const, content: 'The thread with the author so far:' }]),
    ...past,
  ];
  const messages = [
    ...before.map((m, index) => (index === before.length - 1 ? { ...m, stable: true } : m)),
    {
      role: 'user' as const,
      content: [contextMessage(context), memory && memoryContext(memory), lastAuthor?.text ?? '']
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
  const system = memory
    ? `${compagnonSystemPrompt(context)}\n\n${MEMORY_INSTRUCTIONS}`
    : compagnonSystemPrompt(context);

  for (let attempt = 0; attempt < 2; attempt++) {
    const request = {
      system,
      messages:
        attempt === 0 ? messages : [...messages, { role: 'user' as const, content: CORRECTION }],
      responseSchema: chatAnswerSchema,
      maxOutputTokens: 16000,
      tier: 'deep' as const,
    };
    const response = memory
      ? await generateWithMemory(llm, request, memory, signal)
      : await llm.generate(request, signal);
    const answer = parseAnswer(response.text);
    if (!answer) continue;
    const exampleOk = answer.example === null || isOneSentence(answer.example);
    const proseFree =
      narrativeProseIn(answer.reply, authorText).length === 0 &&
      (answer.example === null ||
        narrativeProseIn(answer.example, authorText).every((v) => v.kind !== 'quote'));
    if (exampleOk && proseFree)
      return {
        reply: answer.reply,
        ...(answer.example !== null && { example: answer.example }),
        ...(answer.styleChoiceId !== null && { styleChoiceId: answer.styleChoiceId }),
      };
  }
  return { reply: FALLBACK[context.language.slice(0, 2)] ?? FALLBACK['fr'] ?? '', guarded: true };
}

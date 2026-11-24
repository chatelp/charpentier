import type { AnswerPhase, LlmService } from '@charpentier/platform';
import {
  addChatMessage,
  agentOrigin,
  chatMessages,
  companionThread,
  readMentorLevel,
  bornIn,
} from '@charpentier/schema';
import type * as Y from 'yjs';
import { bookContext } from './book-context';
import { compagnonChat } from './chat';
import { sceneContext, sheetsSummary, validatedStyleChoice } from './context';
import { leavingAlert, leavingSoon, pendingMemory, windowStart } from './memory';
import { keepThreadSummary } from './thread-summary';

/** Turns of the conversation sent back to the model (the oldest are left out). */
const HISTORY = 30;

/**
 * Answers the author's last message in the mentor document, with the open
 * scene and the validated sheets as context, and appends the answer there
 * (origin `agent:chat`). Agents never write into scene documents.
 */
export async function answerAuthor(input: {
  readonly llm: LlmService;
  readonly root: Y.Doc;
  readonly mentorDoc: Y.Doc;
  readonly sceneDoc?: Y.Doc;
  readonly sceneId?: string;
  readonly signal?: AbortSignal;
  /** Where the answer stands (DESIGN 1.34): thinking, writing, reviewing. */
  readonly onPhase?: (phase: AnswerPhase) => void;
}): Promise<'answered' | 'nothing-to-answer'> {
  const messages = chatMessages(input.mentorDoc);
  const last = messages.at(-1);
  if (!last || last.role !== 'author') return 'nothing-to-answer';
  const context = sceneContext(input.root, input.sceneDoc, input.sceneId);
  // One Compagnon (D-35): the interview is part of the conversation's thread, with his notebook.
  // The message just sent is the thread's last turn, as it is its array's (one rule, see companionThread).
  const thread = companionThread(input.mentorDoc, last.id);
  const memory = pendingMemory({
    mentorDoc: input.mentorDoc,
    root: input.root,
    sources: [last.id],
    authorText: thread
      .filter((m) => m.role === 'author')
      .map((m) => m.text)
      .join('\n'),
  });
  // The thread's last messages; before them, its summary; the alert when the oldest are about to go.
  const start = windowStart(thread.length, memory, HISTORY);
  const window = thread.slice(start);
  // What the turn writes besides its answer waits for its end: stopped, it writes nothing.
  const writes: (() => void)[] = [() => memory.file()];
  const flush = () => {
    if (!input.signal?.aborted) for (const write of writes.splice(0)) write();
  };
  const earlier = await keepThreadSummary({
    llm: input.llm,
    mentorDoc: input.mentorDoc,
    thread,
    start,
    language: context.language,
    ...(input.signal && { signal: input.signal }),
    defer: (write) => writes.push(write),
  });
  const alert = leavingAlert(leavingSoon(thread.length, memory, HISTORY), window[0]);
  const answer = await compagnonChat(
    input.llm,
    // The Atelier comes through the Compagnon's tree, whole with its statuses.
    {
      ...context,
      level: readMentorLevel(input.root),
      ...(earlier && { earlier }),
      ...(alert && { alert }),
      book: bookContext({ mentorDoc: input.mentorDoc, store: memory, key: 'chat', start }),
      // What the author validated and said before the window: theirs to be quoted.
      authorWords: [
        sheetsSummary(input.root),
        ...thread.filter((m) => m.role === 'author').map((m) => m.text),
      ].join('\n'),
    },
    window.map((m) => ({
      role: m.role,
      text: m.mode === 'interview' ? `(in the interview) ${m.text}` : m.text,
    })),
    input.signal,
    memory,
    undefined,
    input.onPhase,
  ).finally(flush);
  // Stopped by the author while the guardrails read: nothing is said.
  input.signal?.throwIfAborted();
  addChatMessage(
    input.mentorDoc,
    {
      role: 'compagnon',
      text: answer.reply,
      ...(answer.example !== undefined && { example: answer.example }),
      ...(input.sceneId !== undefined && { sceneId: input.sceneId }),
      ...(memory.changes().length > 0 && { noted: memory.changes() }),
      ...bornIn(input.root),
      // Only a choice the author validated; an invented id is dropped.
      ...(validatedStyleChoice(input.root, answer.styleChoiceId) && {
        styleChoiceId: answer.styleChoiceId,
      }),
    },
    agentOrigin('chat'),
  );
  return 'answered';
}

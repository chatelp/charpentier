import type { LlmService } from '@charpentier/platform';
import {
  addChatMessage,
  agentOrigin,
  chatMessages,
  companionThread,
  readMentorLevel,
} from '@charpentier/schema';
import type * as Y from 'yjs';
import { compagnonChat } from './chat';
import { sceneContext, validatedStyleChoice } from './context';
import { projectMemory, threadWindow } from './memory';

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
}): Promise<'answered' | 'nothing-to-answer'> {
  const messages = chatMessages(input.mentorDoc);
  const last = messages.at(-1);
  if (!last || last.role !== 'author') return 'nothing-to-answer';
  const context = sceneContext(input.root, input.sceneDoc, input.sceneId);
  // One Compagnon (D-35): the interview is part of the conversation's thread, with his notebook.
  const thread = companionThread(input.mentorDoc);
  const memory = projectMemory({
    mentorDoc: input.mentorDoc,
    root: input.root,
    sources: [last.id],
    authorText: thread
      .filter((m) => m.role === 'author')
      .map((m) => m.text)
      .join('\n'),
  });
  const answer = await compagnonChat(
    input.llm,
    // The Atelier comes through the Compagnon's tree, whole with its statuses.
    { ...context, level: readMentorLevel(input.root) },
    threadWindow(thread, memory, HISTORY).map((m) => ({
      role: m.role,
      text: m.mode === 'interview' ? `(in the interview) ${m.text}` : m.text,
    })),
    input.signal,
    memory,
  );
  addChatMessage(
    input.mentorDoc,
    {
      role: 'compagnon',
      text: answer.reply,
      ...(answer.example !== undefined && { example: answer.example }),
      ...(input.sceneId !== undefined && { sceneId: input.sceneId }),
      ...(memory.changes().length > 0 && { noted: memory.changes() }),
      // Only a choice the author validated; an invented id is dropped.
      ...(validatedStyleChoice(input.root, answer.styleChoiceId) && {
        styleChoiceId: answer.styleChoiceId,
      }),
    },
    agentOrigin('chat'),
  );
  return 'answered';
}

import * as Y from 'yjs';
import { newId, nowIso } from './ids';
import type { Origin } from './origins';

/**
 * The free conversation with the Compagnon (docs/SPEC.md §6.7), in the
 * project's mentor document (`project:<pid>/mentor`): a top-level array of
 * messages, appended by the author and by the agent.
 */
export interface ChatMessage {
  readonly id: string;
  readonly role: 'author' | 'compagnon';
  readonly text: string;
  /** One example sentence the author may insert (D-11). */
  readonly example?: string;
  /** The scene open when the message was written. */
  readonly sceneId?: string;
  readonly at: string;
}

const chat = (mentorDoc: Y.Doc) => mentorDoc.getArray<ChatMessage>('chat');

export function chatMessages(mentorDoc: Y.Doc): ChatMessage[] {
  return chat(mentorDoc).toArray();
}

export function addChatMessage(
  mentorDoc: Y.Doc,
  message: Omit<ChatMessage, 'id' | 'at'>,
  origin: Origin,
): string {
  const id = newId();
  mentorDoc.transact(() => {
    chat(mentorDoc).push([
      {
        id,
        at: nowIso(),
        role: message.role,
        text: message.text,
        ...(message.example !== undefined && { example: message.example }),
        ...(message.sceneId !== undefined && { sceneId: message.sceneId }),
      },
    ]);
  }, origin);
  return id;
}

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { exampleSentence, isOneSentence, sentencesOf } from './example-sentence';
import { addChatMessage, chatMessages } from './mentor-chat';
import { agentOrigin } from './origins';

describe('the example sentence (D-11)', () => {
  it('is one short sentence on one line', () => {
    expect(isOneSentence('La pluie collait la chemise d’Hélène à sa peau.')).toBe(true);
    expect(isOneSentence('— Tu viens\u00A0? demanda-t-elle.')).toBe(true);
    expect(isOneSentence('Il pleuvait. Elle attendait.')).toBe(false);
    expect(isOneSentence('Une phrase\nsur deux lignes.')).toBe(false);
    expect(isOneSentence('Une phrase\u2028sur deux lignes.')).toBe(false);
    expect(isOneSentence('x'.repeat(300) + '.')).toBe(false);
    expect(isOneSentence('   ')).toBe(false);
  });

  it('splits French sentences', () => {
    expect(sentencesOf('Il pleut. Vraiment ? Oui… « Partons. » Bon')).toHaveLength(5);
  });

  it('is rejected whole, never cut', () => {
    expect(exampleSentence('  Il pleuvait sur Nantes.  ')).toBe('Il pleuvait sur Nantes.');
    expect(exampleSentence('Il pleuvait. Elle attendait.')).toBeUndefined();
    expect(exampleSentence(42)).toBeUndefined();
    expect(exampleSentence(undefined)).toBeUndefined();
  });

  it('is checked again where the mentor document stores it', () => {
    const mentorDoc = new Y.Doc();
    const origin = agentOrigin('chat');
    addChatMessage(
      mentorDoc,
      { role: 'compagnon', text: 'a', example: 'Il pleuvait. Elle attendait. Rien ne venait.' },
      origin,
    );
    addChatMessage(
      mentorDoc,
      { role: 'compagnon', text: 'b', example: 'Il pleuvait sur Nantes.' },
      origin,
    );
    expect(chatMessages(mentorDoc).map((m) => m.example)).toEqual([
      undefined,
      'Il pleuvait sur Nantes.',
    ]);
  });
});

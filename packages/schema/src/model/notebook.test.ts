import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { addInterviewMessage, addChatMessage, companionThread } from './mentor-chat';
import {
  agentRenameNote,
  agentTrashNote,
  agentWriteNote,
  authorEditNote,
  findNote,
  listNotes,
  listTrashedNotes,
  NoteRefused,
} from './notebook';
import { agentOrigin, AUTHOR } from './origins';

const COMPAGNON = agentOrigin('memory');

describe('the Compagnon’s notebook (phase 6.5)', () => {
  it('keeps one note per path, written and rewritten by the Compagnon', () => {
    const doc = new Y.Doc();
    agentWriteNote(doc, { path: '/memories/projet/grand-pere.md', text: 'Marin.' }, COMPAGNON);
    agentWriteNote(
      doc,
      { path: '/memories/projet/grand-pere.md', text: 'Marin à Saint-Pierre.', sources: ['m1'] },
      COMPAGNON,
    );
    expect(listNotes(doc)).toHaveLength(1);
    expect(findNote(doc, '/memories/projet/grand-pere.md')).toMatchObject({
      text: 'Marin à Saint-Pierre.',
      by: 'compagnon',
      sources: ['m1'],
    });
  });

  it('never lets the Compagnon change, move or remove a note the author touched', () => {
    const doc = new Y.Doc();
    const id = agentWriteNote(
      doc,
      { path: '/memories/projet/ton.md', text: 'Ironique.' },
      COMPAGNON,
    );
    authorEditNote(doc, id, 'Nuancé, sans ironie.', AUTHOR);
    expect(() =>
      agentWriteNote(doc, { path: '/memories/projet/ton.md', text: 'Ironique.' }, COMPAGNON),
    ).toThrow(NoteRefused);
    expect(() => agentTrashNote(doc, '/memories/projet/ton.md', COMPAGNON)).toThrow(NoteRefused);
    expect(() => agentRenameNote(doc, '/memories/projet/ton.md', '/x.md', COMPAGNON)).toThrow(
      NoteRefused,
    );
    expect(findNote(doc, '/memories/projet/ton.md')?.text).toBe('Nuancé, sans ironie.');
  });

  it('puts a removed note in the trash, never deletes it', () => {
    const doc = new Y.Doc();
    agentWriteNote(doc, { path: '/memories/projet/a.md', text: 'A' }, COMPAGNON);
    agentTrashNote(doc, '/memories/projet/a.md', COMPAGNON);
    expect(listNotes(doc)).toEqual([]);
    expect(listTrashedNotes(doc).map((n) => n.text)).toEqual(['A']);
  });
});

describe('one Compagnon, one thread (D-35)', () => {
  it('reads the conversation and the interview as one thread, in the order said, moving nothing', async () => {
    const doc = new Y.Doc();
    addInterviewMessage(doc, { role: 'author', text: 'Mon grand-père était marin.' }, AUTHOR);
    await new Promise((resolve) => setTimeout(resolve, 5));
    addChatMessage(doc, { role: 'author', text: 'Cette scène traîne ?' }, AUTHOR);
    const thread = companionThread(doc);
    expect(thread.map((m) => [m.mode, m.text])).toEqual([
      ['interview', 'Mon grand-père était marin.'],
      ['conversation', 'Cette scène traîne ?'],
    ]);
    // The two arrays are untouched.
    expect(doc.getArray('interview').length).toBe(1);
    expect(doc.getArray('chat').length).toBe(1);
  });
});

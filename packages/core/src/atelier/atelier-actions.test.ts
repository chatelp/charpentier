import {
  AUTHOR,
  createAgentWriter,
  initProject,
  listEntities,
  readFieldRef,
  setField,
} from '@charpentier/schema';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { acceptAndKeep, keepSheetOf, rejectSheet } from './atelier-actions';

function proposedHelene() {
  const root = new Y.Doc({ guid: 'project:p1' });
  initProject(root, { id: 'p1', title: 'La batelière', kind: 'novel' });
  const evidence = [{ messageId: 'm1', quote: 'Hélène est batelière' }];
  const id = createAgentWriter(root, 'interview').proposeEntity(
    'characters',
    { name: 'Hélène', occupation: 'batelière', fear: 'l’eau' },
    evidence,
  );
  const ref = (field: string) => ({ module: 'characters' as const, entityId: id, field });
  const status = () => listEntities(root, 'characters')[0]?.status;
  return { root, ref, status };
}

describe('keeping a field keeps its sheet (DESIGN §4.5, the author’s choice)', () => {
  it('validates the proposed sheet and its name with the field kept', () => {
    const { root, ref, status } = proposedHelene();
    acceptAndKeep(root, ref('occupation'));
    expect(status()).toBe('validated');
    expect(readFieldRef(root, ref('name')).status).toBe('validated');
    expect(readFieldRef(root, ref('fear')).status).toBe('proposed');
  });

  it('does the same when the author writes a value of their own', () => {
    const { root, ref, status } = proposedHelene();
    setField(root, ref('age'), '34 ans', AUTHOR);
    keepSheetOf(root, ref('age'));
    expect(status()).toBe('validated');
  });

  it('rejects a sheet still entirely proposed with its fields, never one with a kept field', () => {
    const first = proposedHelene();
    rejectSheet(first.root, 'characters', listEntities(first.root, 'characters')[0]?.id ?? '');
    expect(first.status()).toBe('rejected');
    expect(readFieldRef(first.root, first.ref('fear')).status).toBe('rejected');

    const second = proposedHelene();
    acceptAndKeep(second.root, second.ref('occupation'));
    rejectSheet(second.root, 'characters', listEntities(second.root, 'characters')[0]?.id ?? '');
    expect(second.status()).toBe('validated');
  });
});

import { describe, expect, it } from 'vitest';
import { newProjectDoc, replicaOf, sync } from '../testing/yjs';
import { createAgentWriter } from './agent-writer';
import type { Evidence } from './fields';
import {
  acceptProposal,
  createEntity,
  getEntity,
  knownByField,
  listEntities,
  listTrashedEntities,
  readFieldRef,
  readSingleton,
  reconsiderEntity,
  rejectEntity,
  rejectProposal,
  restoreEntity,
  setField,
  trashEntity,
  validateEntity,
  type FieldRef,
} from './modules';
import {
  displayStatus,
  dismissSignal,
  isContradicted,
  listSignals,
  resolveSignal,
} from './signals';

const evidence = (quote: string): Evidence[] => [{ sceneId: 's1', variantId: 'v1', quote }];
const pitch: FieldRef = { module: 'meta', field: 'pitch' };

describe('field statuses', () => {
  it('author input is validated; agent input is proposed', () => {
    const doc = newProjectDoc();
    const agent = createAgentWriter(doc, 'bottom-up');
    expect(agent.proposeField(pitch, 'Une enquête sur Mars.', evidence('Mars'))).toEqual({
      ok: true,
    });
    expect(readFieldRef(doc, pitch)).toMatchObject({
      status: 'proposed',
      proposal: { value: 'Une enquête sur Mars.', agent: 'bottom-up' },
    });

    setField(doc, pitch, 'Un deuil, sur Mars.');
    expect(readFieldRef(doc, pitch)).toMatchObject({
      status: 'validated',
      value: 'Un deuil, sur Mars.',
    });
    expect(readFieldRef(doc, pitch).proposal).toBeUndefined();
  });

  it('an agent can never change a validated field', () => {
    const doc = newProjectDoc();
    setField(doc, pitch, 'Ma version.');
    const result = createAgentWriter(doc, 'bottom-up').proposeField(
      pitch,
      'Autre chose.',
      evidence('x'),
    );
    expect(result).toEqual({ ok: false, reason: 'validated', validatedValue: 'Ma version.' });
    expect(readFieldRef(doc, pitch)).toMatchObject({ status: 'validated', value: 'Ma version.' });
  });

  it('accepting a proposal validates it', () => {
    const doc = newProjectDoc();
    createAgentWriter(doc, 'bottom-up').proposeField(pitch, 'Proposé.', evidence('p'));
    acceptProposal(doc, pitch);
    expect(readFieldRef(doc, pitch)).toMatchObject({ status: 'validated', value: 'Proposé.' });
  });

  it('a rejected value is not proposed again, whatever the evidence or the spelling', () => {
    const doc = newProjectDoc();
    const agent = createAgentWriter(doc, 'bottom-up');
    agent.proposeField(pitch, 'Un polar.', evidence('le commissaire'));
    rejectProposal(doc, pitch);
    expect(readFieldRef(doc, pitch).status).toBe('rejected');

    const refused = { ok: false, reason: 'rejected-before' };
    expect(agent.proposeField(pitch, 'Un polar.', evidence('le commissaire'))).toEqual(refused);
    // Another passage quoted for the same value is not a new fact.
    expect(agent.proposeField(pitch, 'Un polar.', evidence('une autopsie'))).toEqual(refused);
    expect(agent.proposeField(pitch, 'un  polar', evidence('une autopsie'))).toEqual(refused);
    expect(readFieldRef(doc, pitch).status).toBe('rejected');
    // Another value is another proposal; accents make another word.
    expect(agent.proposeField(pitch, 'Un pólar.', evidence('une autopsie'))).toEqual({ ok: true });
    expect(agent.proposeField(pitch, 'Un roman noir.', evidence('une autopsie'))).toEqual({
      ok: true,
    });
    expect(agent.proposeField(pitch, 'Un roman noir.', evidence('une autopsie'))).toEqual({
      ok: false,
      reason: 'unchanged',
    });
  });

  it('a concurrent agent proposal on another device never overrides the author', () => {
    const author = newProjectDoc();
    const server = replicaOf(author);
    setField(author, pitch, 'Décision de l’auteur.');
    createAgentWriter(server, 'bottom-up').proposeField(pitch, 'Idée de l’agent.', evidence('y'));
    sync(author, server);
    for (const doc of [author, server]) {
      expect(readFieldRef(doc, pitch)).toMatchObject({
        status: 'validated',
        value: 'Décision de l’auteur.',
      });
    }
  });
});

describe('entities', () => {
  it('are listed in creation order and come back from the trash', () => {
    const doc = newProjectDoc();
    const original = Date.prototype.toISOString;
    const ids: string[] = [];
    try {
      for (const [i, name] of ['Hélène', 'Paul', 'Inès'].entries()) {
        Date.prototype.toISOString = () => `2026-11-12T10:0${i}:00.000Z`;
        ids.push(createEntity(doc, 'characters', { name }));
      }
    } finally {
      Date.prototype.toISOString = original;
    }
    const names = () => listEntities(doc, 'characters').map((c) => c.fields['name']?.value);
    expect(names()).toEqual(['Hélène', 'Paul', 'Inès']);
    trashEntity(doc, 'characters', ids[1] ?? '');
    expect(names()).toEqual(['Hélène', 'Inès']);
    expect(listTrashedEntities(doc, 'characters').map((c) => c.id)).toEqual([ids[1]]);
    restoreEntity(doc, 'characters', ids[1] ?? '');
    expect(names()).toEqual(['Hélène', 'Paul', 'Inès']);
    expect(listTrashedEntities(doc, 'characters')).toEqual([]);
  });

  it('an author-created character is validated with its fields', () => {
    const doc = newProjectDoc();
    const id = createEntity(doc, 'characters', { name: 'Anna', fear: 'Le silence' });
    expect(getEntity(doc, 'characters', id)).toMatchObject({
      status: 'validated',
      fields: {
        name: { status: 'validated', value: 'Anna' },
        fear: { status: 'validated', value: 'Le silence' },
      },
    });
  });

  it('an agent-proposed character waits for the author', () => {
    const doc = newProjectDoc();
    const agent = createAgentWriter(doc, 'bottom-up');
    const id = agent.proposeEntity('characters', { name: 'Paul' }, evidence('Paul entra'));
    expect(getEntity(doc, 'characters', id)).toMatchObject({
      status: 'proposed',
      fields: { name: { status: 'proposed' } },
    });

    rejectEntity(doc, 'characters', id);
    expect(getEntity(doc, 'characters', id)?.status).toBe('rejected');
    expect(
      agent.proposeField(
        { module: 'characters', entityId: id, field: 'age' },
        40,
        evidence('quarante ans'),
      ),
    ).toEqual({
      ok: false,
      reason: 'entity-rejected',
    });

    validateEntity(doc, 'characters', id);
    expect(getEntity(doc, 'characters', id)?.status).toBe('validated');
    expect(listEntities(doc, 'characters')).toHaveLength(1);
  });

  it('clues track planting, resolution, appearances and who knows from when', () => {
    const doc = newProjectDoc();
    const enqueteur = createEntity(doc, 'characters', { name: 'Inspectrice Morel' });
    const clue = createEntity(doc, 'clues', {
      kind: 'clue',
      title: 'La montre arrêtée',
      plantedIn: ['s2'],
      resolvedIn: ['s9'],
    });
    setField(
      doc,
      { module: 'clues', entityId: clue, field: knownByField(enqueteur) },
      { fromSceneId: 's2' },
    );
    setField(
      doc,
      { module: 'clues', entityId: clue, field: knownByField('reader') },
      { fromSceneId: 's5' },
    );
    createAgentWriter(doc, 'bottom-up').proposeField(
      { module: 'clues', entityId: clue, field: 'appearsIn' },
      ['s4'],
      evidence('la montre'),
    );

    const fields = getEntity(doc, 'clues', clue)?.fields ?? {};
    expect(fields[knownByField('reader')]).toMatchObject({
      status: 'validated',
      value: { fromSceneId: 's5' },
    });
    expect(fields[knownByField(enqueteur)]).toMatchObject({ value: { fromSceneId: 's2' } });
    expect(fields['appearsIn']).toMatchObject({ status: 'proposed' });
  });

  it('singleton modules list their fields', () => {
    const doc = newProjectDoc();
    setField(doc, { module: 'structure', field: 'narrativeModel' }, 'three-acts');
    expect(readSingleton(doc, 'structure')).toMatchObject({
      narrativeModel: { status: 'validated', value: 'three-acts' },
    });
  });
});

describe('« contredite » is derived from open conflict signals', () => {
  it('appears while a conflict is open and goes away without losing the validation', () => {
    const doc = newProjectDoc();
    const anna = createEntity(doc, 'characters', { name: 'Anna', appearance: 'Yeux bleus' });
    const eyes: FieldRef = { module: 'characters', entityId: anna, field: 'appearance' };
    const agent = createAgentWriter(doc, 'consistency');

    expect(agent.proposeField(eyes, 'Yeux verts', evidence('ses yeux verts')).ok).toBe(false);
    const signal = agent.raiseSignal({
      kind: 'conflict',
      message: 'Le texte donne à Anna des yeux verts ; sa fiche dit bleus.',
      principle: 'La cohérence des détails physiques entretient la confiance du lecteur.',
      fieldRef: eyes,
    });
    expect(isContradicted(doc, eyes)).toBe(true);
    expect(displayStatus(doc, eyes)).toBe('contradicted');

    resolveSignal(doc, signal);
    expect(displayStatus(doc, eyes)).toBe('validated');
    expect(readFieldRef(doc, eyes)).toMatchObject({ status: 'validated', value: 'Yeux bleus' });
  });

  it('agents can resolve their own open signals but never reopen a dismissed one', () => {
    const doc = newProjectDoc();
    const agent = createAgentWriter(doc, 'language');
    const a = agent.raiseSignal({ kind: 'language', message: 'Espace insécable manquante.' });
    const b = agent.raiseSignal({ kind: 'language', message: 'Accord.' });
    dismissSignal(doc, b);
    expect(agent.resolveOwnSignal(a)).toBe(true);
    expect(agent.resolveOwnSignal(b)).toBe(false);
    const states = Object.fromEntries(listSignals(doc).map((s) => [s.id, s.state]));
    expect(states).toEqual({ [a]: 'resolved', [b]: 'dismissed' });
  });

  it('takes back a rejected entry as a proposal again', () => {
    const doc = newProjectDoc();
    const writer = createAgentWriter(doc, 'test');
    const id = writer.proposeEntity('characters', { name: 'Vasseur' }, []);
    rejectEntity(doc, 'characters', id);
    expect(getEntity(doc, 'characters', id)?.status).toBe('rejected');
    reconsiderEntity(doc, 'characters', id);
    expect(getEntity(doc, 'characters', id)?.status).toBe('proposed');
  });
});

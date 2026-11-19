import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { appendParagraph, newProjectDoc } from '../testing/yjs';
import { createAgentWriter } from './agent-writer';
import { watchAuthorship, type AuthorshipViolation } from './authorship-guard';
import { slot } from './fields';
import { names } from './ids';
import { createChapter, createScene } from './manuscript';
import { createEntity, moduleMap, setField } from './modules';
import { agentOrigin } from './origins';
import { variantFragment } from './scene-content';

const evidence = [{ sceneId: 's', variantId: 'v', quote: 'q' }];

function watched(doc: Y.Doc) {
  const violations: AuthorshipViolation[] = [];
  watchAuthorship(doc, (v) => violations.push(v));
  return violations;
}

describe('createAgentWriter', () => {
  it('refuses scene and history documents', () => {
    expect(() => createAgentWriter(new Y.Doc({ guid: 'project:p1/scene:s1' }), 'x')).toThrow();
    expect(() =>
      createAgentWriter(new Y.Doc({ guid: 'project:p1/scene:s1/history' }), 'x'),
    ).toThrow();
  });
});

describe('watchAuthorship', () => {
  it('finds nothing wrong in everything AgentWriter does', () => {
    const doc = newProjectDoc();
    const violations = watched(doc);
    const character = createEntity(doc, 'characters', { name: 'Anna' });
    const agent = createAgentWriter(doc, 'bottom-up');

    agent.proposeField({ module: 'meta', field: 'pitch' }, 'Pitch', evidence);
    agent.proposeField(
      { module: 'characters', entityId: character, field: 'fear' },
      'Le noir',
      evidence,
    );
    agent.proposeField(
      { module: 'characters', entityId: character, field: 'name' },
      'Anne',
      evidence,
    ); // refused: validated
    agent.proposeEntity(
      'worldRules',
      { title: 'Gravité martienne', statement: '0,38 g' },
      evidence,
    );
    const s = agent.raiseSignal({ kind: 'craft', message: 'Scène sans enjeu.' });
    agent.resolveOwnSignal(s);

    expect(violations).toEqual([]);
  });

  it('reports an agent writing an author slot or the manuscript', () => {
    const doc = newProjectDoc();
    const chapterId = createChapter(doc, { title: 'Un' });
    const character = createEntity(doc, 'characters', { name: 'Anna' });
    setField(doc, { module: 'meta', field: 'pitch' }, 'Ma décision');
    const violations = watched(doc);
    const rogue = agentOrigin('rogue');

    doc.transact(
      () => moduleMap(doc, 'meta').set(slot.value('pitch'), { value: 'Écrasé', at: '' }),
      rogue,
    );
    doc.transact(
      () =>
        (moduleMap(doc, 'characters').get(character) as Y.Map<unknown>).set('$validatedAt', 'x'),
      rogue,
    );
    doc.transact(() => moduleMap(doc, 'characters').delete(character), rogue);
    const { sceneId } = createScene(doc, { chapterId, title: 'Écrite par un agent' }, rogue);
    doc.transact(() => doc.getMap(names.chapters).delete(chapterId), rogue);

    expect(violations.map((v) => `${v.location} ${v.key}`)).toEqual([
      'module:meta pitch#value',
      'module:characters $validatedAt',
      `module:characters ${character}`,
      `scenes ${sceneId}`,
      `chapters ${chapterId}`,
    ]);
  });

  it('reports any agent write to a scene document', () => {
    const sceneDoc = new Y.Doc({ guid: 'project:p1/scene:s1' });
    const violations = watched(sceneDoc);
    sceneDoc.transact(
      () => appendParagraph(variantFragment(sceneDoc, 'v1'), 'Prose générée.'),
      agentOrigin('rogue'),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.reason).toMatch(/scene/);
  });

  it('lets agents write to the mentor document, which is theirs', () => {
    const mentorDoc = new Y.Doc({ guid: 'project:p1/mentor' });
    const violations = watched(mentorDoc);
    mentorDoc.transact(
      () => mentorDoc.getMap<string>('analyses').set('s1', 'digest'),
      agentOrigin('scene-analysis'),
    );
    expect(violations).toEqual([]);
    // A history document is not the mentor's: still reported.
    const historyDoc = new Y.Doc({ guid: 'project:p1/scene:s1/history' });
    const reported = watched(historyDoc);
    historyDoc.transact(() => historyDoc.getMap('x').set('a', 1), agentOrigin('rogue'));
    expect(reported).toHaveLength(1);
  });

  it('ignores the author', () => {
    const doc = newProjectDoc();
    const violations = watched(doc);
    setField(doc, { module: 'meta', field: 'pitch' }, 'Libre');
    createChapter(doc, { title: 'Un' });
    expect(violations).toEqual([]);
  });
});

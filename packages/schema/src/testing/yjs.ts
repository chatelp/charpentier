import * as Y from 'yjs';
import { initProject } from '../model/project';

export const PROJECT_ID = 'p1';

export function newProjectDoc(): Y.Doc {
  const doc = new Y.Doc({ guid: `project:${PROJECT_ID}` });
  initProject(doc, { id: PROJECT_ID, title: 'Mon roman', kind: 'novel' });
  return doc;
}

/** A second replica of `doc`, fully synced. */
export function replicaOf(doc: Y.Doc): Y.Doc {
  const other = new Y.Doc({ guid: doc.guid });
  Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
  return other;
}

/** Exchanges all missing updates between two replicas (offline edits then reconnect). */
export function sync(a: Y.Doc, b: Y.Doc): void {
  const toB = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const toA = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, toB);
  Y.applyUpdate(a, toA);
}

/** Appends a paragraph `<paragraph>text</paragraph>`, optionally italic, to a fragment. */
export function appendParagraph(fragment: Y.XmlFragment, text: string, italic = false): void {
  const paragraph = new Y.XmlElement('paragraph');
  const content = new Y.XmlText();
  paragraph.insert(0, [content]);
  fragment.push([paragraph]);
  content.insert(0, text, italic ? { italic: {} } : {});
}

import { sceneSchema } from '@charpentier/schema';
import { getSchema } from '@tiptap/core';
import type { NodeType, Schema } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { sceneEditorExtensions, sceneSchemaExtensions } from './extensions';

/** What matters for the Yjs encoding and for document validity. */
function describeSchema(schema: Schema) {
  const node = (type: NodeType) => ({
    content: type.spec.content ?? '',
    group: type.spec.group ?? '',
    inline: type.isInline,
    leaf: type.isLeaf,
    attrs: Object.keys(type.spec.attrs ?? {}).sort(),
  });
  return {
    nodes: Object.fromEntries(Object.values(schema.nodes).map((t) => [t.name, node(t)])),
    marks: Object.keys(schema.marks).sort(),
    topNode: schema.topNodeType.name,
  };
}

describe('editor schema', () => {
  it('is exactly the scene schema of @charpentier/schema', () => {
    expect(describeSchema(getSchema(sceneSchemaExtensions))).toEqual(describeSchema(sceneSchema));
  });

  it('stays the same once collaboration and editor helpers are added', () => {
    const extensions = sceneEditorExtensions({
      fragment: new Y.Doc().getXmlFragment('f'),
      placeholder: '',
    });
    expect(describeSchema(getSchema(extensions))).toEqual(describeSchema(sceneSchema));
  });
});
